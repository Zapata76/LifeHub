<?php

/**
 * Persists the weekly meal-planning aggregate and its shopping-list exports.
 */

declare(strict_types=1);

namespace LifeHub\Meals;

use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Persistence\OperationJournal;
use PDO;

final class MealRepository
{
    /** @var PDO */ private $pdo;
    /** @var OperationJournal */ private $journal;

    public function __construct(PDO $pdo, OperationJournal $journal)
    {
        $this->pdo = $pdo;
        $this->journal = $journal;
    }

    /** @return array<string, mixed> */
    public function overview(UserContext $user, string $start, string $end): array
    {
        $meals = $this->rows(
            'SELECT m.id, m.meal_date, m.meal_type, m.description, m.notes, m.servings, m.created_by, '
            . 'm.version, u.username AS creator_name FROM lh_meal_plan m '
            . 'LEFT JOIN lh_users u ON u.household_id = m.household_id AND u.id = m.created_by '
            . 'WHERE m.household_id = ? AND m.meal_date BETWEEN ? AND ? AND m.archived_at IS NULL '
            . 'ORDER BY m.meal_date, FIELD(m.meal_type, \'breakfast\', \'lunch\', \'dinner\'), m.id',
            [$user->householdId(), $start, $end]
        );
        foreach ($meals as &$meal) {
            $meal['recipes'] = $this->rows(
                'SELECT r.id, r.title, r.category_text, r.prep_time_minutes, r.difficulty, r.servings, '
                . '(SELECT a.id FROM lh_attachments a WHERE a.household_id = r.household_id '
                . "AND a.owner_type = 'recipe' AND a.owner_id = r.id AND a.archived_at IS NULL "
                . 'ORDER BY a.id DESC LIMIT 1) AS image_attachment_id '
                . 'FROM lh_meal_plan_recipes link INNER JOIN lh_recipes r '
                . 'ON r.household_id = link.household_id AND r.id = link.recipe_id '
                . 'WHERE link.household_id = ? AND link.meal_plan_id = ? AND link.archived_at IS NULL '
                . 'AND r.archived_at IS NULL ORDER BY link.position_no, link.id',
                [$user->householdId(), (int) $meal['id']]
            );
        }
        unset($meal);

        return [
            'meals' => $meals,
            'recipes' => $this->rows(
                'SELECT r.id, r.title, r.category_text, r.prep_time_minutes, r.difficulty, r.servings, '
                . '(SELECT a.id FROM lh_attachments a WHERE a.household_id = r.household_id '
                . "AND a.owner_type = 'recipe' AND a.owner_id = r.id AND a.archived_at IS NULL "
                . 'ORDER BY a.id DESC LIMIT 1) AS image_attachment_id '
                . 'FROM lh_recipes r WHERE r.household_id = ? AND r.archived_at IS NULL '
                . 'ORDER BY r.title_search, r.id',
                [$user->householdId()]
            ),
            'primaryListId' => $this->primaryListId($user->householdId()),
        ];
    }

    /**
     * @param array<string, mixed> $meal
     * @param list<int> $recipeIds
     */
    public function create(UserContext $user, array $meal, array $recipeIds): int
    {
        $this->assertSlotFree($user->householdId(), $meal['date'], $meal['type'], null);
        $this->assertRecipes($user->householdId(), $recipeIds);
        $now = gmdate('Y-m-d H:i:s');
        $statement = $this->pdo->prepare(
            'INSERT INTO lh_meal_plan (household_id, meal_date, meal_type, description, notes, servings, '
            . 'created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([
            $user->householdId(), $meal['date'], $meal['type'], $meal['description'], $meal['notes'],
            $meal['servings'], $user->id(), $now, $now,
        ]);
        $id = (int) $this->pdo->lastInsertId();
        $this->replaceRecipes($user->householdId(), $id, $recipeIds, $now);
        return $id;
    }

    /**
     * @param array<string, mixed> $meal
     * @param list<int> $recipeIds
     */
    public function update(UserContext $user, int $id, int $version, array $meal, array $recipeIds): void
    {
        $this->assertSlotFree($user->householdId(), $meal['date'], $meal['type'], $id);
        $this->assertRecipes($user->householdId(), $recipeIds);
        $statement = $this->pdo->prepare(
            'UPDATE lh_meal_plan SET meal_date = ?, meal_type = ?, description = ?, notes = ?, servings = ?, '
            . 'updated_at = ?, version = version + 1 WHERE household_id = ? AND id = ? AND version = ? '
            . 'AND archived_at IS NULL'
        );
        $now = gmdate('Y-m-d H:i:s');
        $statement->execute([
            $meal['date'], $meal['type'], $meal['description'], $meal['notes'], $meal['servings'], $now,
            $user->householdId(), $id, $version,
        ]);
        $this->assertChanged($statement, 'meal.version_conflict');
        $this->replaceRecipes($user->householdId(), $id, $recipeIds, $now);
    }

    public function delete(UserContext $user, int $id, int $version): void
    {
        $this->assertMeal($user->householdId(), $id, $version);
        $links = $this->pdo->prepare('DELETE FROM lh_meal_plan_recipes WHERE household_id = ? AND meal_plan_id = ?');
        $links->execute([$user->householdId(), $id]);
        $meal = $this->pdo->prepare('DELETE FROM lh_meal_plan WHERE household_id = ? AND id = ? AND version = ?');
        $meal->execute([$user->householdId(), $id, $version]);
        $this->assertChanged($meal, 'meal.version_conflict');
    }

    /**
     * @param list<int> $mealIds
     * @return array<string, mixed>
     */
    public function shoppingPreview(UserContext $user, array $mealIds): array
    {
        $ingredients = $this->ingredients($user->householdId(), $mealIds, true);
        $preview = $this->aggregateIngredients($ingredients, $mealIds);
        foreach ($preview['items'] as &$item) {
            unset($item['exports']);
        }
        unset($item);
        return $preview;
    }

    /**
     * @param list<int> $mealIds
     * @return array<string, mixed>
     */
    public function generateShopping(UserContext $user, int $listId, array $mealIds, string $key): array
    {
        $this->assertList($user->householdId(), $listId);
        $input = ['listId' => $listId, 'mealIds' => $mealIds];
        $checksum = hash('sha256', json_encode($input, JSON_THROW_ON_ERROR));
        return $this->journal->run(
            $user->householdId(),
            $user->id(),
            'meal.shopping.generate',
            $key,
            $checksum,
            function (int $runId) use ($user, $listId, $mealIds): array {
                $ingredients = $this->ingredients($user->householdId(), $mealIds, true);
                $preview = $this->aggregateIngredients($ingredients, $mealIds);
                $created = 0;
                foreach ($preview['items'] as $item) {
                    $ingredientIds = array_map('intval', $item['ingredientIds']);
                    $result = $this->journal->step(
                        $runId,
                        'product:' . (string) $item['productId'] . ':' . hash('sha1', implode(',', $ingredientIds)),
                        function () use ($user, $listId, $item): int {
                            return $this->exportGroup($user, $listId, $item);
                        }
                    );
                    if ($result !== null) {
                        $created++;
                    }
                }
                return [
                    'replayed' => false,
                    'operationId' => $runId,
                    'createdItems' => $created,
                    'exportedIngredients' => (int) $preview['exportableIngredientCount'],
                    'skippedIngredients' => count($preview['unresolved']),
                ];
            }
        );
    }

    /** @param list<int> $ids */
    private function assertRecipes(int $householdId, array $ids): void
    {
        if ($ids === []) {
            return;
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $statement = $this->pdo->prepare(
            'SELECT COUNT(*) FROM lh_recipes WHERE household_id = ? AND id IN (' . $placeholders . ') '
            . 'AND archived_at IS NULL'
        );
        $statement->execute(array_merge([$householdId], $ids));
        if ((int) $statement->fetchColumn() !== count($ids)) {
            throw new ApiException(422, 'meal.recipe_invalid', 'Una ricetta selezionata non è disponibile.');
        }
    }

    private function assertSlotFree(int $householdId, string $date, string $type, ?int $exceptId): void
    {
        $sql = 'SELECT COUNT(*) FROM lh_meal_plan WHERE household_id = ? AND meal_date = ? '
            . 'AND meal_type = ? AND archived_at IS NULL';
        $params = [$householdId, $date, $type];
        if ($exceptId !== null) {
            $sql .= ' AND id <> ?';
            $params[] = $exceptId;
        }
        $statement = $this->pdo->prepare($sql);
        $statement->execute($params);
        if ((int) $statement->fetchColumn() > 0) {
            throw new ApiException(409, 'meal.slot_occupied', 'Questa fascia del giorno è già pianificata.');
        }
    }

    /** @param list<int> $recipeIds */
    private function replaceRecipes(int $householdId, int $mealId, array $recipeIds, string $now): void
    {
        $delete = $this->pdo->prepare('DELETE FROM lh_meal_plan_recipes WHERE household_id = ? AND meal_plan_id = ?');
        $delete->execute([$householdId, $mealId]);
        $insert = $this->pdo->prepare(
            'INSERT INTO lh_meal_plan_recipes (household_id, meal_plan_id, recipe_id, position_no, created_at) '
            . 'VALUES (?, ?, ?, ?, ?)'
        );
        foreach ($recipeIds as $position => $recipeId) {
            $insert->execute([$householdId, $mealId, $recipeId, $position, $now]);
        }
    }

    /**
     * @param list<int> $mealIds
     * @return list<array<string, mixed>>
     */
    private function ingredients(int $householdId, array $mealIds, bool $onlyPending): array
    {
        if ($mealIds === []) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($mealIds), '?'));
        $sql = 'SELECT m.id AS meal_id, m.meal_date, m.meal_type, r.id AS recipe_id, r.title AS recipe_title, '
            . 'i.id AS ingredient_id, i.product_id, i.ingredient_name, i.quantity_raw, p.name AS product_name '
            . 'FROM lh_meal_plan m INNER JOIN lh_meal_plan_recipes l '
            . 'ON l.household_id = m.household_id AND l.meal_plan_id = m.id AND l.archived_at IS NULL '
            . 'INNER JOIN lh_recipes r ON r.household_id = l.household_id AND r.id = l.recipe_id '
            . 'AND r.archived_at IS NULL INNER JOIN lh_recipe_ingredients i '
            . 'ON i.household_id = r.household_id AND i.recipe_id = r.id AND i.archived_at IS NULL '
            . 'LEFT JOIN lh_products p ON p.household_id = i.household_id AND p.id = i.product_id '
            . 'AND p.archived_at IS NULL WHERE m.household_id = ? AND m.id IN (' . $placeholders . ') '
            . 'AND m.archived_at IS NULL';
        if ($onlyPending) {
            $sql .= ' AND NOT EXISTS (SELECT 1 FROM lh_meal_shopping_exports x WHERE x.household_id = m.household_id '
                . 'AND x.meal_plan_id = m.id AND x.recipe_ingredient_id = i.id)';
        }
        $sql .= ' ORDER BY m.meal_date, m.meal_type, r.title_search, i.position_no, i.id';
        return $this->rows($sql, array_merge([$householdId], $mealIds));
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @param list<int> $mealIds
     * @return array<string, mixed>
     */
    private function aggregateIngredients(array $rows, array $mealIds): array
    {
        $groups = [];
        $unresolved = [];
        $count = 0;
        foreach ($rows as $row) {
            if ($row['product_id'] === null || $row['product_name'] === null) {
                $unresolved[] = [
                    'ingredient' => (string) $row['ingredient_name'], 'quantity' => $row['quantity_raw'],
                    'recipe' => (string) $row['recipe_title'], 'mealDate' => (string) $row['meal_date'],
                ];
                continue;
            }
            $count++;
            $key = (string) $row['product_id'];
            if (!isset($groups[$key])) {
                $groups[$key] = [
                    'productId' => (int) $row['product_id'], 'name' => (string) $row['product_name'],
                    'quantities' => [], 'sources' => [], 'ingredientIds' => [], 'mealIds' => [], 'exports' => [],
                ];
            }
            $quantity = trim((string) ($row['quantity_raw'] ?? '')) ?: 'q.b.';
            $groups[$key]['quantities'][$quantity] = ($groups[$key]['quantities'][$quantity] ?? 0) + 1;
            $source = (string) $row['recipe_title'] . ' · ' . (string) $row['meal_date'];
            $groups[$key]['sources'][$source] = true;
            $groups[$key]['ingredientIds'][] = (int) $row['ingredient_id'];
            $groups[$key]['mealIds'][] = (int) $row['meal_id'];
            $groups[$key]['exports'][] = [
                'mealId' => (int) $row['meal_id'], 'ingredientId' => (int) $row['ingredient_id'],
            ];
        }
        $items = [];
        foreach ($groups as $group) {
            $parts = [];
            foreach ($group['quantities'] as $quantity => $occurrences) {
                $parts[] = $occurrences > 1 ? $occurrences . ' × ' . $quantity : $quantity;
            }
            $group['quantity'] = implode(' + ', $parts);
            $group['sources'] = array_keys($group['sources']);
            $group['mealIds'] = array_values(array_unique($group['mealIds']));
            unset($group['quantities']);
            $items[] = $group;
        }
        usort($items, static function (array $a, array $b): int {
            return strcasecmp($a['name'], $b['name']);
        });
        return [
            'mealIds' => $mealIds, 'items' => $items, 'unresolved' => $unresolved,
            'exportableIngredientCount' => $count,
        ];
    }

    /** @param array<string, mixed> $item */
    private function exportGroup(UserContext $user, int $listId, array $item): int
    {
        $now = gmdate('Y-m-d H:i:s');
        $statement = $this->pdo->prepare(
            'INSERT INTO lh_shopping_items (household_id, list_id, product_id, label, quantity_raw, checked, '
            . 'source_type, source_id, created_by, created_at, updated_by, updated_at) '
            . 'VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)'
        );
        $sourceId = (int) $item['mealIds'][0];
        $statement->execute([
            $user->householdId(), $listId, $item['productId'], $item['name'], $item['quantity'],
            'meal_plan', $sourceId, $user->id(), $now, $user->id(), $now,
        ]);
        $itemId = (int) $this->pdo->lastInsertId();
        $export = $this->pdo->prepare(
            'INSERT IGNORE INTO lh_meal_shopping_exports (household_id, meal_plan_id, recipe_ingredient_id, '
            . 'shopping_item_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        );
        foreach ($item['exports'] as $source) {
            $export->execute([
                $user->householdId(), $source['mealId'], $source['ingredientId'], $itemId, $user->id(), $now,
            ]);
        }
        return $itemId;
    }

    private function primaryListId(int $householdId): ?int
    {
        $statement = $this->pdo->prepare(
            'SELECT id FROM lh_shopping_lists WHERE household_id = ? AND archived_at IS NULL '
            . 'ORDER BY is_primary DESC, id LIMIT 1'
        );
        $statement->execute([$householdId]);
        $id = $statement->fetchColumn();
        return $id === false ? null : (int) $id;
    }

    private function assertList(int $householdId, int $listId): void
    {
        $statement = $this->pdo->prepare(
            'SELECT COUNT(*) FROM lh_shopping_lists WHERE household_id = ? AND id = ? AND archived_at IS NULL'
        );
        $statement->execute([$householdId, $listId]);
        if ((int) $statement->fetchColumn() !== 1) {
            throw new ApiException(404, 'shopping.list_not_found', 'Lista non trovata.');
        }
    }

    private function assertMeal(int $householdId, int $id, int $version): void
    {
        $statement = $this->pdo->prepare(
            'SELECT version FROM lh_meal_plan WHERE household_id = ? AND id = ? AND archived_at IS NULL'
        );
        $statement->execute([$householdId, $id]);
        $current = $statement->fetchColumn();
        if ($current === false) {
            throw new ApiException(404, 'meal.not_found', 'Pasto non trovato.');
        }
        if ((int) $current !== $version) {
            throw new ApiException(409, 'meal.version_conflict', 'Il pasto è cambiato; ricarica e riprova.');
        }
    }

    /**
     * @param list<mixed> $parameters
     * @return list<array<string, mixed>>
     */
    private function rows(string $sql, array $parameters): array
    {
        $statement = $this->pdo->prepare($sql);
        $statement->execute($parameters);
        $rows = $statement->fetchAll();
        return $rows;
    }

    private function assertChanged(\PDOStatement $statement, string $code): void
    {
        if ($statement->rowCount() !== 1) {
            throw new ApiException(409, $code, 'Il pasto è cambiato; ricarica e riprova.');
        }
    }
}
