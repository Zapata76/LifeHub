<?php

/**
 * Reads the household shopping workspace and persists fast list-item commands.
 * SQL stays here; HTTP validation, authorization, and rendering stay outside.
 */

declare(strict_types=1);

namespace LifeHub\Shopping;

use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use PDO;

final class ShoppingRepository
{
    /** @var PDO */ private $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /** @return array<string, list<array<string, mixed>>> */
    public function overview(UserContext $user): array
    {
        $householdId = $user->householdId();
        return [
            'lists' => $this->rows(
                'SELECT id, name, is_primary, version FROM lh_shopping_lists '
                . 'WHERE household_id = ? AND archived_at IS NULL ORDER BY is_primary DESC, id',
                [$householdId]
            ),
            'items' => $this->items($householdId),
            'categories' => $this->rows(
                'SELECT id, name, version FROM lh_categories WHERE household_id = ? '
                . 'AND archived_at IS NULL ORDER BY name_key',
                [$householdId]
            ),
            'supermarkets' => $this->rows(
                'SELECT id, name, version FROM lh_supermarkets WHERE household_id = ? '
                . 'AND archived_at IS NULL ORDER BY name_key',
                [$householdId]
            ),
            'products' => $this->products($householdId),
            'product_recipe_usages' => $this->rows(
                'SELECT DISTINCT i.product_id, r.id AS recipe_id, r.title AS recipe_title '
                . 'FROM lh_recipe_ingredients i INNER JOIN lh_recipes r '
                . 'ON r.household_id = i.household_id AND r.id = i.recipe_id '
                . 'WHERE i.household_id = ? AND i.product_id IS NOT NULL '
                . 'AND i.archived_at IS NULL AND r.archived_at IS NULL '
                . 'ORDER BY i.product_id, r.title, r.id',
                [$householdId]
            ),
            'prices' => $this->prices($householdId),
        ];
    }

    public function create(
        UserContext $user,
        int $listId,
        int $productId,
        ?int $supermarketId,
        string $quantity
    ): int {
        $householdId = $user->householdId();
        $this->assertActive('lh_shopping_lists', $householdId, $listId, 'shopping.list_not_found');
        $product = $this->activeProduct($householdId, $productId);
        if ($supermarketId !== null) {
            $this->assertActive('lh_supermarkets', $householdId, $supermarketId, 'shopping.supermarket_not_found');
        }
        $duplicate = $this->pdo->prepare(
            'SELECT COUNT(*) FROM lh_shopping_items WHERE household_id = ? AND list_id = ? '
            . 'AND product_id = ? AND supermarket_id <=> ? AND archived_at IS NULL'
        );
        $duplicate->execute([$householdId, $listId, $productId, $supermarketId]);
        if ((int) $duplicate->fetchColumn() > 0) {
            throw new ApiException(409, 'shopping.duplicate', 'Il prodotto è già presente per questo supermercato.');
        }
        $now = gmdate('Y-m-d H:i:s');
        $statement = $this->pdo->prepare(
            'INSERT INTO lh_shopping_items (household_id, list_id, product_id, supermarket_id, label, '
            . 'quantity_raw, checked, created_by, created_at, updated_by, updated_at) '
            . 'VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)'
        );
        $statement->execute([
            $householdId, $listId, $productId, $supermarketId, $product['name'], $quantity,
            $user->id(), $now, $user->id(), $now,
        ]);
        return (int) $this->pdo->lastInsertId();
    }

    public function update(
        UserContext $user,
        int $id,
        int $version,
        bool $checked,
        ?string $quantity,
        ?int $supermarketId
    ): void {
        $item = $this->item($user, $id);
        if ($supermarketId !== null) {
            $this->assertActive(
                'lh_supermarkets',
                $user->householdId(),
                $supermarketId,
                'shopping.supermarket_not_found'
            );
        }
        $quantity = $quantity === null ? (string) ($item['quantity_raw'] ?? '') : $quantity;
        $statement = $this->pdo->prepare(
            'UPDATE lh_shopping_items SET checked = ?, quantity_raw = ?, supermarket_id = ?, '
            . 'updated_by = ?, updated_at = ?, version = version + 1 '
            . 'WHERE household_id = ? AND id = ? AND version = ? AND archived_at IS NULL'
        );
        $statement->execute([
            $checked ? 1 : 0, $quantity, $supermarketId, $user->id(), gmdate('Y-m-d H:i:s'),
            $user->householdId(), $id, $version,
        ]);
        $this->assertChanged($statement);
    }

    public function remove(UserContext $user, int $id, int $version): void
    {
        $this->item($user, $id);
        $statement = $this->pdo->prepare(
            'UPDATE lh_shopping_items SET archived_at = ?, updated_by = ?, updated_at = ?, '
            . 'version = version + 1 WHERE household_id = ? AND id = ? AND version = ? AND archived_at IS NULL'
        );
        $now = gmdate('Y-m-d H:i:s');
        $statement->execute([$now, $user->id(), $now, $user->householdId(), $id, $version]);
        $this->assertChanged($statement);
    }

    public function clearChecked(UserContext $user, int $listId): int
    {
        $this->assertActive('lh_shopping_lists', $user->householdId(), $listId, 'shopping.list_not_found');
        $statement = $this->pdo->prepare(
            'DELETE FROM lh_shopping_items WHERE household_id = ? AND list_id = ? '
            . 'AND checked = 1 AND archived_at IS NULL'
        );
        $statement->execute([$user->householdId(), $listId]);
        return $statement->rowCount();
    }

    /**
     * Physically removes a shopping catalogue entity and repairs its household-scoped references.
     * MyISAM does not provide transactions, so the complete mutation is protected by table locks.
     *
     * @return list<string> Storage keys that must be discarded after the database mutation.
     */
    public function deleteCatalog(
        UserContext $user,
        string $resource,
        int $id,
        int $version,
        ?int $replacementCategoryId = null
    ): array {
        $tables = [
            'categories' => 'lh_categories',
            'supermarkets' => 'lh_supermarkets',
            'products' => 'lh_products',
            'prices' => 'lh_prices',
        ];
        if (!isset($tables[$resource])) {
            throw new ApiException(404, 'shopping.resource_not_found', 'Shopping resource not found.');
        }
        if ($resource !== 'categories' && $replacementCategoryId !== null) {
            throw new ApiException(
                422,
                'shopping.replacement_not_allowed',
                'A replacement category is only valid when deleting a category.'
            );
        }
        if ($resource === 'categories' && $replacementCategoryId === $id) {
            throw new ApiException(422, 'shopping.replacement_invalid', 'The replacement category must differ.');
        }

        $this->pdo->exec(
            'LOCK TABLES lh_categories WRITE, lh_supermarkets WRITE, lh_products WRITE, '
            . 'lh_prices WRITE, lh_shopping_items WRITE, lh_recipe_ingredients WRITE, '
            . 'lh_attachments WRITE'
        );
        try {
            $table = $tables[$resource];
            $this->assertCurrentVersion($table, $user->householdId(), $id, $version, $resource);
            $storageKeys = [];

            if ($resource === 'categories') {
                if ($replacementCategoryId !== null) {
                    $this->assertActive(
                        'lh_categories',
                        $user->householdId(),
                        $replacementCategoryId,
                        'shopping.replacement_category_not_found'
                    );
                }
                $statement = $this->pdo->prepare(
                    'UPDATE lh_products SET category_id = ?, version = version + 1 '
                    . 'WHERE household_id = ? AND category_id = ?'
                );
                $statement->execute([$replacementCategoryId, $user->householdId(), $id]);
            } elseif ($resource === 'supermarkets') {
                $priceIds = $this->relatedIds('lh_prices', 'supermarket_id', $user->householdId(), $id);
                $storageKeys = $this->deleteAttachments($user->householdId(), 'price', $priceIds);
                $statement = $this->pdo->prepare(
                    'DELETE FROM lh_prices WHERE household_id = ? AND supermarket_id = ?'
                );
                $statement->execute([$user->householdId(), $id]);
                $statement = $this->pdo->prepare(
                    'UPDATE lh_shopping_items SET supermarket_id = NULL, version = version + 1 '
                    . 'WHERE household_id = ? AND supermarket_id = ?'
                );
                $statement->execute([$user->householdId(), $id]);
            } elseif ($resource === 'products') {
                $priceIds = $this->relatedIds('lh_prices', 'product_id', $user->householdId(), $id);
                $storageKeys = array_merge(
                    $this->deleteAttachments($user->householdId(), 'price', $priceIds),
                    $this->deleteAttachments($user->householdId(), 'product', [$id])
                );
                $statement = $this->pdo->prepare('DELETE FROM lh_prices WHERE household_id = ? AND product_id = ?');
                $statement->execute([$user->householdId(), $id]);
                $statement = $this->pdo->prepare(
                    'UPDATE lh_shopping_items SET product_id = NULL, version = version + 1 '
                    . 'WHERE household_id = ? AND product_id = ?'
                );
                $statement->execute([$user->householdId(), $id]);
                $statement = $this->pdo->prepare(
                    'UPDATE lh_recipe_ingredients SET product_id = NULL, version = version + 1 '
                    . 'WHERE household_id = ? AND product_id = ?'
                );
                $statement->execute([$user->householdId(), $id]);
            } else {
                $storageKeys = $this->deleteAttachments($user->householdId(), 'price', [$id]);
            }

            $statement = $this->pdo->prepare(
                'DELETE FROM ' . $table . ' WHERE household_id = ? AND id = ? AND version = ?'
            );
            $statement->execute([$user->householdId(), $id, $version]);
            if ($statement->rowCount() !== 1) {
                throw new ApiException(409, 'version.conflict', 'The resource was modified by another request.');
            }
            return array_values(array_unique($storageKeys));
        } finally {
            $this->pdo->exec('UNLOCK TABLES');
        }
    }

    /** @return list<array<string, mixed>> */
    private function items(int $householdId): array
    {
        return $this->rows(
            'SELECT i.id, i.list_id, i.product_id, i.supermarket_id, i.label, i.quantity_raw, '
            . 'i.checked, i.source_type, i.source_id, i.version, p.name AS product_name, '
            . 'c.name AS category_name, s.name AS supermarket_name, '
            . 'a.id AS image_attachment_id '
            . 'FROM lh_shopping_items i LEFT JOIN lh_products p ON p.household_id = i.household_id '
            . 'AND p.id = i.product_id LEFT JOIN lh_categories c ON c.household_id = i.household_id '
            . 'AND c.id = p.category_id LEFT JOIN lh_supermarkets s ON s.household_id = i.household_id '
            . 'AND s.id = i.supermarket_id ' . $this->attachmentJoin('product', 'p.id')
            . ' WHERE i.household_id = ? AND i.archived_at IS NULL '
            . 'ORDER BY i.checked, COALESCE(c.name_key, p.name_key), p.name_key, i.id',
            [$householdId]
        );
    }

    /** @return list<array<string, mixed>> */
    private function products(int $householdId): array
    {
        return $this->rows(
            'SELECT p.id, p.category_id, p.name, p.version, c.name AS category_name, '
            . 'a.id AS image_attachment_id '
            . 'FROM lh_products p LEFT JOIN lh_categories c ON c.household_id = p.household_id '
            . 'AND c.id = p.category_id ' . $this->attachmentJoin('product', 'p.id')
            . ' WHERE p.household_id = ? AND p.archived_at IS NULL '
            . 'ORDER BY COALESCE(c.name_key, p.name_key), p.name_key',
            [$householdId]
        );
    }

    /** @return list<array<string, mixed>> */
    private function prices(int $householdId): array
    {
        return $this->rows(
            'SELECT pr.id, pr.product_id, pr.supermarket_id, pr.amount, pr.currency, pr.package_text, '
            . 'pr.observed_on, pr.created_at, pr.version, p.name AS product_name, '
            . 'c.name AS category_name, s.name AS supermarket_name, u.username, '
            . 'a.id AS image_attachment_id '
            . 'FROM lh_prices pr JOIN lh_products p ON p.household_id = pr.household_id '
            . 'AND p.id = pr.product_id LEFT JOIN lh_categories c ON c.household_id = pr.household_id '
            . 'AND c.id = p.category_id JOIN lh_supermarkets s ON s.household_id = pr.household_id '
            . 'AND s.id = pr.supermarket_id LEFT JOIN lh_users u ON u.household_id = pr.household_id '
            . 'AND u.id = pr.created_by ' . $this->attachmentJoin('price', 'pr.id')
            . ' WHERE pr.household_id = ? AND pr.archived_at IS NULL ORDER BY pr.created_at DESC, pr.id DESC',
            [$householdId]
        );
    }

    private function attachmentJoin(string $ownerType, string $ownerExpression): string
    {
        return "LEFT JOIN lh_attachments a ON a.id = (SELECT MAX(ax.id) FROM lh_attachments ax "
            . "WHERE ax.household_id = p.household_id AND ax.owner_type = '" . $ownerType . "' "
            . 'AND ax.owner_id = ' . $ownerExpression
            . " AND ax.detected_mime LIKE 'image/%' AND ax.archived_at IS NULL)";
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
            throw new ApiException(404, 'shopping.product_not_found', 'Product not found.');
        }
        return $row;
    }

    /** @return array<string, mixed> */
    private function item(UserContext $user, int $id): array
    {
        $statement = $this->pdo->prepare(
            'SELECT * FROM lh_shopping_items WHERE household_id = ? AND id = ? AND archived_at IS NULL'
        );
        $statement->execute([$user->householdId(), $id]);
        $row = $statement->fetch();
        if (!is_array($row)) {
            throw new ApiException(404, 'shopping.item_not_found', 'Shopping item not found.');
        }
        return $row;
    }

    private function assertActive(string $table, int $householdId, int $id, string $code): void
    {
        $statement = $this->pdo->prepare(
            'SELECT COUNT(*) FROM ' . $table . ' WHERE household_id = ? AND id = ? AND archived_at IS NULL'
        );
        $statement->execute([$householdId, $id]);
        if ((int) $statement->fetchColumn() !== 1) {
            throw new ApiException(404, $code, 'Referenced resource not found.');
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

    private function assertChanged(\PDOStatement $statement): void
    {
        if ($statement->rowCount() !== 1) {
            throw new ApiException(409, 'version.conflict', 'The shopping item changed; reload and retry.');
        }
    }

    private function assertCurrentVersion(
        string $table,
        int $householdId,
        int $id,
        int $version,
        string $resource
    ): void {
        $statement = $this->pdo->prepare(
            'SELECT version FROM ' . $table . ' WHERE household_id = ? AND id = ? LIMIT 1'
        );
        $statement->execute([$householdId, $id]);
        $current = $statement->fetchColumn();
        if ($current === false) {
            throw new ApiException(404, 'shopping.' . $resource . '_not_found', 'Resource not found.');
        }
        if ((int) $current !== $version) {
            throw new ApiException(409, 'version.conflict', 'The resource was modified by another request.');
        }
    }

    /** @return list<int> */
    private function relatedIds(string $table, string $column, int $householdId, int $id): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id FROM ' . $table . ' WHERE household_id = ? AND ' . $column . ' = ?'
        );
        $statement->execute([$householdId, $id]);
        $ids = $statement->fetchAll(PDO::FETCH_COLUMN);
        return array_map('intval', $ids);
    }

    /**
     * @param list<int> $ownerIds
     * @return list<string>
     */
    private function deleteAttachments(int $householdId, string $ownerType, array $ownerIds): array
    {
        if ($ownerIds === []) {
            return [];
        }
        $placeholders = implode(', ', array_fill(0, count($ownerIds), '?'));
        $parameters = array_merge([$householdId, $ownerType], $ownerIds);
        $statement = $this->pdo->prepare(
            'SELECT storage_key FROM lh_attachments WHERE household_id = ? AND owner_type = ? '
            . 'AND owner_id IN (' . $placeholders . ')'
        );
        $statement->execute($parameters);
        $keys = $statement->fetchAll(PDO::FETCH_COLUMN);
        $statement = $this->pdo->prepare(
            'DELETE FROM lh_attachments WHERE household_id = ? AND owner_type = ? '
            . 'AND owner_id IN (' . $placeholders . ')'
        );
        $statement->execute($parameters);
        return array_values(array_map('strval', $keys));
    }
}
