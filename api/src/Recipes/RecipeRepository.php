<?php

/**
 * Persists the aggregate recipe editor used by the dedicated recipe workspace.
 */

declare(strict_types=1);

namespace LifeHub\Recipes;

use LifeHub\Shared\Auth\Authorization;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use PDO;

final class RecipeRepository
{
    /** @var PDO */ private $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /** @return array<string, mixed> */
    public function overview(UserContext $user): array
    {
        $householdId = $user->householdId();
        $recipes = $this->rows(
            'SELECT r.id, r.title, r.description, r.instructions, r.category_text, '
            . 'r.prep_time_minutes, r.difficulty, r.servings, r.created_by, r.version, '
            . 'u.username AS author_name, COUNT(DISTINCT i.id) AS ingredient_count, '
            . 'a.id AS image_attachment_id '
            . 'FROM lh_recipes r LEFT JOIN lh_users u ON u.household_id = r.household_id '
            . 'AND u.id = r.created_by LEFT JOIN lh_recipe_ingredients i ON i.household_id = r.household_id '
            . 'AND i.recipe_id = r.id AND i.archived_at IS NULL ' . $this->attachmentJoin()
            . ' WHERE r.household_id = ? AND r.archived_at IS NULL '
            . 'GROUP BY r.id, a.id ORDER BY r.title_search, r.id',
            [$householdId]
        );
        foreach ($recipes as &$recipe) {
            $recipe['can_edit'] = Authorization::canManageHousehold($user)
                || (int) $recipe['created_by'] === $user->id();
        }
        unset($recipe);

        return [
            'recipes' => $recipes,
            'categories' => array_values(array_map(
                function (array $row): string {
                    return (string) $row['category_text'];
                },
                $this->rows(
                    "SELECT DISTINCT category_text FROM lh_recipes WHERE household_id = ? "
                    . "AND archived_at IS NULL AND category_text IS NOT NULL AND category_text <> '' "
                    . 'ORDER BY category_text',
                    [$householdId]
                )
            )),
            'products' => $this->rows(
                'SELECT p.id, p.name, c.name AS category_name FROM lh_products p '
                . 'LEFT JOIN lh_categories c ON c.household_id = p.household_id AND c.id = p.category_id '
                . 'WHERE p.household_id = ? AND p.archived_at IS NULL '
                . 'ORDER BY COALESCE(c.name_key, p.name_key), p.name_key',
                [$householdId]
            ),
            'members' => $this->rows(
                "SELECT id, username FROM lh_users WHERE household_id = ? AND status = 'active' "
                . 'AND archived_at IS NULL ORDER BY username_key',
                [$householdId]
            ),
        ];
    }

    /** @return array<string, mixed> */
    public function detail(UserContext $user, int $id): array
    {
        $rows = $this->rows(
            'SELECT r.id, r.title, r.description, r.instructions, r.category_text, '
            . 'r.prep_time_minutes, r.difficulty, r.servings, r.created_by, r.version, '
            . 'u.username AS author_name, a.id AS image_attachment_id '
            . 'FROM lh_recipes r LEFT JOIN lh_users u ON u.household_id = r.household_id '
            . 'AND u.id = r.created_by ' . $this->attachmentJoin()
            . ' WHERE r.household_id = ? AND r.id = ? AND r.archived_at IS NULL LIMIT 1',
            [$user->householdId(), $id]
        );
        if ($rows === []) {
            throw new ApiException(404, 'recipe.not_found', 'Recipe not found.');
        }
        $recipe = $rows[0];
        $recipe['ingredients'] = $this->rows(
            'SELECT i.id, i.product_id, i.ingredient_name, i.quantity_raw, i.position_no, '
            . 'p.name AS product_name, c.name AS category_name FROM lh_recipe_ingredients i '
            . 'LEFT JOIN lh_products p ON p.household_id = i.household_id AND p.id = i.product_id '
            . 'LEFT JOIN lh_categories c ON c.household_id = p.household_id AND c.id = p.category_id '
            . 'WHERE i.household_id = ? AND i.recipe_id = ? AND i.archived_at IS NULL '
            . 'ORDER BY i.position_no, i.id',
            [$user->householdId(), $id]
        );
        $recipe['can_edit'] = $this->canEdit($user, $recipe);
        return $recipe;
    }

    /**
     * @param array<string, mixed> $recipe
     * @param list<array<string, mixed>> $ingredients
     */
    public function create(UserContext $user, array $recipe, array $ingredients): int
    {
        $now = gmdate('Y-m-d H:i:s');
        $statement = $this->pdo->prepare(
            'INSERT INTO lh_recipes (household_id, title, title_search, description, instructions, '
            . 'category_text, prep_time_minutes, difficulty, created_by, created_at, updated_by, updated_at) '
            . 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([
            $user->householdId(), $recipe['title'], $this->searchKey((string) $recipe['title']),
            $recipe['description'], $recipe['instructions'], $recipe['category'],
            $recipe['prepTimeMinutes'], $recipe['difficulty'], $user->id(), $now, $user->id(), $now,
        ]);
        $id = (int) $this->pdo->lastInsertId();
        $this->replaceIngredients($user, $id, $ingredients, $now);
        return $id;
    }

    /**
     * @param array<string, mixed> $recipe
     * @param list<array<string, mixed>> $ingredients
     */
    public function update(UserContext $user, int $id, int $version, array $recipe, array $ingredients): void
    {
        $current = $this->detail($user, $id);
        $this->assertCanEdit($user, $current);
        $now = gmdate('Y-m-d H:i:s');
        $statement = $this->pdo->prepare(
            'UPDATE lh_recipes SET title = ?, title_search = ?, description = ?, instructions = ?, '
            . 'category_text = ?, prep_time_minutes = ?, difficulty = ?, updated_by = ?, updated_at = ?, '
            . 'version = version + 1 WHERE household_id = ? AND id = ? AND version = ? AND archived_at IS NULL'
        );
        $statement->execute([
            $recipe['title'], $this->searchKey((string) $recipe['title']), $recipe['description'],
            $recipe['instructions'], $recipe['category'], $recipe['prepTimeMinutes'], $recipe['difficulty'],
            $user->id(), $now, $user->householdId(), $id, $version,
        ]);
        $this->assertChanged($statement);
        $this->replaceIngredients($user, $id, $ingredients, $now);
    }

    public function archive(UserContext $user, int $id, int $version): void
    {
        $current = $this->detail($user, $id);
        $this->assertCanEdit($user, $current);
        $now = gmdate('Y-m-d H:i:s');
        $statement = $this->pdo->prepare(
            'UPDATE lh_recipes SET archived_at = ?, updated_by = ?, updated_at = ?, version = version + 1 '
            . 'WHERE household_id = ? AND id = ? AND version = ? AND archived_at IS NULL'
        );
        $statement->execute([$now, $user->id(), $now, $user->householdId(), $id, $version]);
        $this->assertChanged($statement);
        $ingredients = $this->pdo->prepare(
            'UPDATE lh_recipe_ingredients SET archived_at = ?, updated_at = ?, version = version + 1 '
            . 'WHERE household_id = ? AND recipe_id = ? AND archived_at IS NULL'
        );
        $ingredients->execute([$now, $now, $user->householdId(), $id]);
    }

    public function removeImage(UserContext $user, int $id): void
    {
        $recipe = $this->detail($user, $id);
        $this->assertCanEdit($user, $recipe);
        if ($recipe['image_attachment_id'] === null) {
            return;
        }
        $statement = $this->pdo->prepare(
            'UPDATE lh_attachments SET archived_at = ?, version = version + 1 '
            . 'WHERE household_id = ? AND id = ? AND archived_at IS NULL'
        );
        $statement->execute([gmdate('Y-m-d H:i:s'), $user->householdId(), (int) $recipe['image_attachment_id']]);
    }

    /** @param list<array<string, mixed>> $ingredients */
    private function replaceIngredients(UserContext $user, int $recipeId, array $ingredients, string $now): void
    {
        $archive = $this->pdo->prepare(
            'UPDATE lh_recipe_ingredients SET archived_at = ?, updated_at = ?, version = version + 1 '
            . 'WHERE household_id = ? AND recipe_id = ? AND archived_at IS NULL'
        );
        $archive->execute([$now, $now, $user->householdId(), $recipeId]);
        $insert = $this->pdo->prepare(
            'INSERT INTO lh_recipe_ingredients (household_id, recipe_id, product_id, ingredient_name, '
            . 'quantity_raw, position_no, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        foreach ($ingredients as $position => $ingredient) {
            $productId = $ingredient['productId'];
            $name = (string) $ingredient['name'];
            if ($productId !== null) {
                $product = $this->activeProduct($user->householdId(), (int) $productId);
                if ($name === '') {
                    $name = (string) $product['name'];
                }
            }
            if ($name === '') {
                continue;
            }
            $insert->execute([
                $user->householdId(), $recipeId, $productId, $name,
                $ingredient['quantity'], $position + 1, $now, $now,
            ]);
        }
    }

    /** @return array<string, mixed> */
    private function activeProduct(int $householdId, int $id): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, name FROM lh_products WHERE household_id = ? AND id = ? AND archived_at IS NULL'
        );
        $statement->execute([$householdId, $id]);
        $row = $statement->fetch();
        if (!is_array($row)) {
            throw new ApiException(422, 'recipe.product_not_found', 'An ingredient product no longer exists.');
        }
        return $row;
    }

    /** @param array<string, mixed> $recipe */
    private function canEdit(UserContext $user, array $recipe): bool
    {
        return Authorization::canManageHousehold($user) || (int) $recipe['created_by'] === $user->id();
    }

    /** @param array<string, mixed> $recipe */
    private function assertCanEdit(UserContext $user, array $recipe): void
    {
        if (!$this->canEdit($user, $recipe)) {
            throw new ApiException(403, 'authorization.denied', 'This recipe belongs to another user.');
        }
    }

    private function attachmentJoin(): string
    {
        return "LEFT JOIN lh_attachments a ON a.id = (SELECT MAX(ax.id) FROM lh_attachments ax "
            . "WHERE ax.household_id = r.household_id AND ax.owner_type = 'recipe' AND ax.owner_id = r.id "
            . "AND ax.detected_mime LIKE 'image/%' AND ax.archived_at IS NULL)";
    }

    private function searchKey(string $value): string
    {
        return (string) mb_substr(mb_strtolower(trim($value), 'UTF-8'), 0, 255, 'UTF-8');
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
        return is_array($rows) ? $rows : [];
    }

    private function assertChanged(\PDOStatement $statement): void
    {
        if ($statement->rowCount() !== 1) {
            throw new ApiException(409, 'version.conflict', 'The recipe changed; reload and retry.');
        }
    }
}
