<?php

/**
 * Generates explainable shopping items from recipe ingredients with resumable steps.
 */

declare(strict_types=1);

namespace LifeHub\Shopping;

use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Persistence\OperationJournal;
use PDO;

final class ShoppingGenerator
{
    /** @var PDO */ private $pdo;
    /** @var OperationJournal */ private $journal;

    public function __construct(PDO $pdo, OperationJournal $journal)
    {
        $this->pdo = $pdo;
        $this->journal = $journal;
    }

    /** @return mixed */
    public function generate(UserContext $user, int $listId, ?int $recipeId, ?int $mealId, string $key)
    {
        if ($recipeId === null && $mealId === null) {
            throw new ApiException(422, 'shopping.source_required', 'recipeId or mealId is required.');
        }
        $this->assertList($user, $listId);
        $input = ['listId' => $listId, 'recipeId' => $recipeId, 'mealId' => $mealId];
        $checksum = hash('sha256', json_encode($input, JSON_THROW_ON_ERROR));
        return $this->journal->run(
            $user->householdId(),
            $user->id(),
            'shopping.generate',
            $key,
            $checksum,
            function (int $runId) use ($user, $listId, $recipeId, $mealId): array {
                $ingredients = $this->ingredients($user, $recipeId, $mealId);
                $created = 0;
                foreach ($ingredients as $ingredient) {
                    $result = $this->journal->step(
                        $runId,
                        'ingredient:' . (string) $ingredient['id'],
                        function () use ($user, $listId, $ingredient): int {
                            return $this->insertItem($user, $listId, $ingredient);
                        }
                    );
                    if ($result !== null) {
                        $created++;
                    }
                }
                return ['replayed' => false, 'operationId' => $runId, 'created' => $created];
            }
        );
    }

    private function assertList(UserContext $user, int $listId): void
    {
        $statement = $this->pdo->prepare(
            'SELECT COUNT(*) FROM lh_shopping_lists WHERE household_id = ? AND id = ? AND archived_at IS NULL'
        );
        $statement->execute([$user->householdId(), $listId]);
        if ((int) $statement->fetchColumn() !== 1) {
            throw new ApiException(404, 'shopping.list_not_found', 'Shopping list not found.');
        }
    }

    /** @return list<array<string, mixed>> */
    private function ingredients(UserContext $user, ?int $recipeId, ?int $mealId): array
    {
        if ($recipeId !== null) {
            $sql = 'SELECT * FROM lh_recipe_ingredients WHERE household_id = ? '
                . 'AND recipe_id = ? AND archived_at IS NULL ORDER BY position_no, id';
            $values = [$user->householdId(), $recipeId];
        } else {
            $sql = 'SELECT ingredient.* FROM lh_recipe_ingredients ingredient '
                . 'INNER JOIN lh_meal_plan_recipes link ON link.recipe_id = ingredient.recipe_id '
                . 'WHERE ingredient.household_id = ? AND link.household_id = ? AND link.meal_plan_id = ? '
                . 'AND ingredient.archived_at IS NULL AND link.archived_at IS NULL ORDER BY ingredient.id';
            $values = [$user->householdId(), $user->householdId(), $mealId];
        }
        $statement = $this->pdo->prepare($sql);
        $statement->execute($values);
        $rows = $statement->fetchAll();
        if (!is_array($rows) || $rows === []) {
            throw new ApiException(404, 'shopping.ingredients_not_found', 'No source ingredients were found.');
        }
        return $rows;
    }

    /** @param array<string, mixed> $ingredient */
    private function insertItem(UserContext $user, int $listId, array $ingredient): int
    {
        $now = gmdate('Y-m-d H:i:s');
        $statement = $this->pdo->prepare(
            'INSERT INTO lh_shopping_items '
            . '(household_id, list_id, product_id, label, quantity_raw, checked, source_type, source_id, '
            . 'created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([
            $user->householdId(), $listId, $ingredient['product_id'], $ingredient['ingredient_name'],
            $ingredient['quantity_raw'], 'recipe_ingredient', $ingredient['id'],
            $user->id(), $now, $user->id(), $now,
        ]);
        return (int) $this->pdo->lastInsertId();
    }
}
