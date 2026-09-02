<?php

/**
 * Reads and persists the aggregate household inventory workspace.
 */

declare(strict_types=1);

namespace LifeHub\Inventory;

use LifeHub\Shared\Auth\Authorization;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Text\SearchKey;
use PDO;
use PDOException;
use Throwable;

final class InventoryRepository
{
    /** @var PDO */ private $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /** @return array<string, mixed> */
    public function overview(UserContext $user, bool $archived = false): array
    {
        $items = $this->items($user, null, $archived);
        $counts = $this->counts($user);
        return [
            'items' => $items,
            'categories' => $this->categories($user),
            'members' => $this->members($user),
            'documents' => Authorization::canManageHousehold($user) ? $this->documents($user) : [],
            'can_manage' => Authorization::canManageHousehold($user),
            'active_count' => $counts['active'],
            'archived_count' => $counts['archived'],
        ];
    }

    /** @return array<string, mixed> */
    public function detail(UserContext $user, int $id): array
    {
        foreach ($this->items($user, $id, null) as $item) {
            return $item;
        }
        throw new ApiException(404, 'inventory.not_found', 'Inventory item not found.');
    }

    /** @param array<string, mixed> $item */
    public function create(UserContext $user, array $item): int
    {
        $this->assertManager($user);
        $this->assertRelations($user, $item['categoryId'], $item['ownerId'], $item['documentId']);
        $now = gmdate('Y-m-d H:i:s');
        $statement = $this->pdo->prepare(
            'INSERT INTO lh_inventory (household_id, owner_id, document_id, category_id, name, name_search, '
            . 'quantity, unit_code, location, status, notes, purchase_date, warranty_expiry, '
            . 'created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([
            $user->householdId(), $item['ownerId'], $item['documentId'], $item['categoryId'], $item['name'],
            $this->searchKey((string) $item['name']), $item['quantity'], $item['unit'],
            $item['location'], 'active', $item['notes'], $item['purchaseDate'], $item['warrantyExpiry'],
            $user->id(), $now, $now,
        ]);
        return (int) $this->pdo->lastInsertId();
    }

    /** @param array<string, mixed> $item */
    public function update(UserContext $user, int $id, int $version, array $item): void
    {
        $this->assertManager($user);
        $this->detail($user, $id);
        $this->assertRelations($user, $item['categoryId'], $item['ownerId'], $item['documentId']);
        $statement = $this->pdo->prepare(
            'UPDATE lh_inventory SET owner_id = ?, document_id = ?, category_id = ?, name = ?, name_search = ?, '
            . 'quantity = ?, unit_code = ?, location = ?, notes = ?, purchase_date = ?, '
            . 'warranty_expiry = ?, updated_at = ?, version = version + 1 '
            . 'WHERE household_id = ? AND id = ? AND version = ? AND archived_at IS NULL'
        );
        $statement->execute([
            $item['ownerId'], $item['documentId'], $item['categoryId'], $item['name'],
            $this->searchKey((string) $item['name']), $item['quantity'], $item['unit'],
            $item['location'], $item['notes'],
            $item['purchaseDate'], $item['warrantyExpiry'], gmdate('Y-m-d H:i:s'),
            $user->householdId(), $id, $version,
        ]);
        $this->assertChanged($statement);
    }

    public function archive(UserContext $user, int $id, int $version): void
    {
        $this->assertManager($user);
        $this->detail($user, $id);
        $statement = $this->pdo->prepare(
            'UPDATE lh_inventory SET archived_at = ?, updated_at = ?, version = version + 1 '
            . 'WHERE household_id = ? AND id = ? AND version = ? AND archived_at IS NULL'
        );
        $now = gmdate('Y-m-d H:i:s');
        $statement->execute([$now, $now, $user->householdId(), $id, $version]);
        $this->assertChanged($statement);
    }

    public function restore(UserContext $user, int $id, int $version): void
    {
        $this->assertManager($user);
        $this->detail($user, $id);
        $statement = $this->pdo->prepare(
            'UPDATE lh_inventory SET archived_at = NULL, updated_at = ?, version = version + 1 '
            . 'WHERE household_id = ? AND id = ? AND version = ? AND archived_at IS NOT NULL'
        );
        $statement->execute([gmdate('Y-m-d H:i:s'), $user->householdId(), $id, $version]);
        $this->assertChanged($statement);
    }

    public function removeImage(UserContext $user, int $id): void
    {
        $this->assertManager($user);
        $item = $this->detail($user, $id);
        if ($item['image_attachment_id'] === null) {
            return;
        }
        $statement = $this->pdo->prepare(
            'UPDATE lh_attachments SET archived_at = ?, version = version + 1 '
            . 'WHERE household_id = ? AND id = ? AND archived_at IS NULL'
        );
        $statement->execute([gmdate('Y-m-d H:i:s'), $user->householdId(), (int) $item['image_attachment_id']]);
    }

    public function deleteImage(UserContext $user, int $id, int $imageId, int $version): string
    {
        $this->assertManager($user);
        $this->detail($user, $id);
        $this->pdo->exec('LOCK TABLES lh_inventory WRITE, lh_attachments WRITE');
        try {
            $attachment = $this->pdo->prepare(
                'SELECT storage_key FROM lh_attachments WHERE household_id = ? '
                . "AND owner_type = 'inventory' AND owner_id = ? AND id = ? "
                . "AND detected_mime LIKE 'image/%' AND archived_at IS NULL"
            );
            $attachment->execute([$user->householdId(), $id, $imageId]);
            $storageKey = $attachment->fetchColumn();
            if (!is_string($storageKey)) {
                throw new ApiException(404, 'inventory.image_not_found', 'Inventory image not found.');
            }

            $current = $this->pdo->prepare(
                'SELECT updated_at FROM lh_inventory WHERE household_id = ? AND id = ? '
                . 'AND version = ? AND archived_at IS NULL'
            );
            $current->execute([$user->householdId(), $id, $version]);
            $previousUpdatedAt = $current->fetchColumn();
            if (!is_string($previousUpdatedAt)) {
                throw new ApiException(409, 'version.conflict', 'The inventory item changed; reload and retry.');
            }

            $item = $this->pdo->prepare(
                'UPDATE lh_inventory SET updated_at = ?, version = version + 1 '
                . 'WHERE household_id = ? AND id = ? AND version = ? AND archived_at IS NULL'
            );
            $item->execute([gmdate('Y-m-d H:i:s'), $user->householdId(), $id, $version]);
            if ($item->rowCount() !== 1) {
                throw new ApiException(409, 'version.conflict', 'The inventory item changed; reload and retry.');
            }

            $delete = $this->pdo->prepare(
                "DELETE FROM lh_attachments WHERE household_id = ? AND owner_type = 'inventory' "
                . 'AND owner_id = ? AND id = ?'
            );
            try {
                $delete->execute([$user->householdId(), $id, $imageId]);
            } catch (Throwable $exception) {
                $this->restoreItemVersion($user->householdId(), $id, $version + 1, $previousUpdatedAt);
                throw $exception;
            }
            if ($delete->rowCount() !== 1) {
                $this->restoreItemVersion($user->householdId(), $id, $version + 1, $previousUpdatedAt);
                throw new ApiException(409, 'version.conflict', 'The inventory image changed; reload and retry.');
            }
            return $storageKey;
        } finally {
            $this->pdo->exec('UNLOCK TABLES');
        }
    }

    private function restoreItemVersion(int $householdId, int $id, int $currentVersion, string $updatedAt): void
    {
        $restore = $this->pdo->prepare(
            'UPDATE lh_inventory SET updated_at = ?, version = version - 1 '
            . 'WHERE household_id = ? AND id = ? AND version = ?'
        );
        $restore->execute([$updatedAt, $householdId, $id, $currentVersion]);
    }

    /** @return list<string> */
    public function delete(UserContext $user, int $id, int $version): array
    {
        $this->assertManager($user);
        $this->detail($user, $id);
        $files = $this->rows(
            'SELECT storage_key FROM lh_attachments WHERE household_id = ? '
            . "AND owner_type = 'inventory' AND owner_id = ?",
            [$user->householdId(), $id]
        );
        $delete = $this->pdo->prepare(
            'DELETE FROM lh_inventory WHERE household_id = ? AND id = ? AND version = ?'
        );
        $delete->execute([$user->householdId(), $id, $version]);
        if ($delete->rowCount() !== 1) {
            throw new ApiException(
                409,
                'version.conflict',
                'The inventory item changed; reload and retry.'
            );
        }
        $attachments = $this->pdo->prepare(
            "DELETE FROM lh_attachments WHERE household_id = ? AND owner_type = 'inventory' AND owner_id = ?"
        );
        $attachments->execute([$user->householdId(), $id]);
        return array_values(array_map(function (array $row): string {
            return (string) $row['storage_key'];
        }, $files));
    }

    public function createCategory(UserContext $user, string $name): int
    {
        $this->assertManager($user);
        $key = SearchKey::from($name);
        $this->assertCategoryNameAvailable($user, $key, null);
        $now = gmdate('Y-m-d H:i:s');
        try {
            $statement = $this->pdo->prepare(
                'INSERT INTO lh_inventory_categories '
                . '(household_id, name, name_key, is_fallback, created_by, created_at, updated_at) '
                . 'VALUES (?, ?, ?, 0, ?, ?, ?)'
            );
            $statement->execute([$user->householdId(), $name, $key, $user->id(), $now, $now]);
        } catch (PDOException $exception) {
            if ((string) $exception->getCode() === '23000') {
                throw new ApiException(409, 'inventory.category_duplicate', 'Inventory category already exists.');
            }
            throw $exception;
        }
        return (int) $this->pdo->lastInsertId();
    }

    public function updateCategory(UserContext $user, int $id, int $version, string $name): void
    {
        $this->assertManager($user);
        $category = $this->category($user, $id);
        if ((int) $category['is_fallback'] === 1) {
            throw new ApiException(422, 'inventory.category_fallback', 'The fallback category cannot be renamed.');
        }
        $key = SearchKey::from($name);
        $this->assertCategoryNameAvailable($user, $key, $id);
        try {
            $statement = $this->pdo->prepare(
                'UPDATE lh_inventory_categories SET name = ?, name_key = ?, updated_at = ?, '
                . 'version = version + 1 WHERE household_id = ? AND id = ? AND version = ?'
            );
            $statement->execute([$name, $key, gmdate('Y-m-d H:i:s'), $user->householdId(), $id, $version]);
        } catch (PDOException $exception) {
            if ((string) $exception->getCode() === '23000') {
                throw new ApiException(409, 'inventory.category_duplicate', 'Inventory category already exists.');
            }
            throw $exception;
        }
        if ($statement->rowCount() !== 1) {
            throw new ApiException(409, 'version.conflict', 'The inventory category changed; reload and retry.');
        }
    }

    public function deleteCategory(UserContext $user, int $id, int $version): int
    {
        $this->assertManager($user);
        $this->pdo->exec('LOCK TABLES lh_inventory_categories WRITE, lh_inventory WRITE');
        try {
            $category = $this->category($user, $id);
            if ((int) $category['version'] !== $version) {
                throw new ApiException(409, 'version.conflict', 'The inventory category changed; reload and retry.');
            }
            if ((int) $category['is_fallback'] === 1) {
                throw new ApiException(422, 'inventory.category_fallback', 'The fallback category cannot be deleted.');
            }
            $fallback = $this->pdo->prepare(
                'SELECT id FROM lh_inventory_categories WHERE household_id = ? AND is_fallback = 1 LIMIT 1'
            );
            $fallback->execute([$user->householdId()]);
            $fallbackId = $fallback->fetchColumn();
            if ($fallbackId === false) {
                throw new ApiException(409, 'inventory.category_fallback_missing', 'Fallback category is missing.');
            }
            $now = gmdate('Y-m-d H:i:s');
            $items = $this->pdo->prepare(
                'UPDATE lh_inventory SET category_id = ?, updated_at = ?, version = version + 1 '
                . 'WHERE household_id = ? AND category_id = ?'
            );
            $items->execute([(int) $fallbackId, $now, $user->householdId(), $id]);
            $moved = $items->rowCount();
            $delete = $this->pdo->prepare(
                'DELETE FROM lh_inventory_categories WHERE household_id = ? AND id = ? AND version = ?'
            );
            $delete->execute([$user->householdId(), $id, $version]);
            if ($delete->rowCount() !== 1) {
                throw new ApiException(409, 'version.conflict', 'The inventory category changed; reload and retry.');
            }
            return $moved;
        } finally {
            $this->pdo->exec('UNLOCK TABLES');
        }
    }

    /** @return list<array<string, mixed>> */
    private function items(UserContext $user, ?int $id, ?bool $archived): array
    {
        $conditions = ['i.household_id = ?'];
        $values = [$user->householdId()];
        if ($archived !== null) {
            $conditions[] = $archived ? 'i.archived_at IS NOT NULL' : 'i.archived_at IS NULL';
        }
        if ($id !== null) {
            $conditions[] = 'i.id = ?';
            $values[] = $id;
        }
        if ($user->role() === 'child') {
            $conditions[] = 'i.owner_id = ?';
            $values[] = $user->id();
        }
        $items = $this->rows(
            'SELECT i.id, i.owner_id, i.document_id, i.category_id, i.name, c.name AS category_name, '
            . 'i.quantity, i.unit_code, '
            . 'i.location, i.status, i.notes, i.purchase_date, i.warranty_expiry, i.created_by, i.version, '
            . 'i.archived_at, '
            . 'u.username AS owner_name, d.title AS document_title, d.owner_id AS document_owner_id, '
            . 'a.id AS image_attachment_id, (SELECT COUNT(*) FROM lh_attachments ac '
            . "WHERE ac.household_id = i.household_id AND ac.owner_type = 'inventory' AND ac.owner_id = i.id "
            . "AND ac.detected_mime LIKE 'image/%') AS image_count "
            . 'FROM lh_inventory i INNER JOIN lh_inventory_categories c ON c.household_id = i.household_id '
            . 'AND c.id = i.category_id LEFT JOIN lh_users u ON u.household_id = i.household_id '
            . 'AND u.id = i.owner_id LEFT JOIN lh_documents d ON d.household_id = i.household_id '
            . 'AND d.id = i.document_id AND d.archived_at IS NULL ' . $this->attachmentJoin()
            . ' WHERE ' . implode(' AND ', $conditions) . ' ORDER BY i.name_search, i.id',
            $values
        );
        $imagesByItem = [];
        foreach ($this->images($user, $id) as $image) {
            $itemId = (int) $image['owner_id'];
            $imagesByItem[$itemId][] = [
                'id' => (int) $image['id'],
                'name' => (string) $image['original_name'],
                'mime' => (string) $image['detected_mime'],
                'size' => (int) $image['size_bytes'],
            ];
        }
        foreach ($items as &$item) {
            if ($user->role() === 'child' && (int) $item['document_owner_id'] !== $user->id()) {
                $item['document_id'] = null;
                $item['document_title'] = null;
            }
            unset($item['document_owner_id']);
            $images = $imagesByItem[(int) $item['id']] ?? [];
            $latest = count($images) > 0 ? $images[count($images) - 1] : null;
            $item['image_count'] = (int) $item['image_count'];
            $item['images'] = $images;
            $item['image_attachment_id'] = $latest === null ? null : $latest['id'];
            $item['can_edit'] = Authorization::canManageHousehold($user);
        }
        unset($item);
        return $items;
    }

    /** @return list<array<string, mixed>> */
    private function images(UserContext $user, ?int $itemId): array
    {
        $sql = 'SELECT a.id, a.owner_id, a.original_name, a.detected_mime, a.size_bytes '
            . 'FROM lh_attachments a INNER JOIN lh_inventory i ON i.household_id = a.household_id '
            . 'AND i.id = a.owner_id '
            . "WHERE a.household_id = ? AND a.owner_type = 'inventory' "
            . "AND a.detected_mime LIKE 'image/%' AND a.archived_at IS NULL";
        $values = [$user->householdId()];
        if ($itemId !== null) {
            $sql .= ' AND a.owner_id = ?';
            $values[] = $itemId;
        }
        if ($user->role() === 'child') {
            $sql .= ' AND i.owner_id = ?';
            $values[] = $user->id();
        }
        return $this->rows($sql . ' ORDER BY a.owner_id, a.created_at, a.id', $values);
    }

    /** @return array{active:int, archived:int} */
    private function counts(UserContext $user): array
    {
        $sql = 'SELECT '
            . 'SUM(CASE WHEN archived_at IS NULL THEN 1 ELSE 0 END) AS active_count, '
            . 'SUM(CASE WHEN archived_at IS NOT NULL THEN 1 ELSE 0 END) AS archived_count '
            . 'FROM lh_inventory WHERE household_id = ?';
        $values = [$user->householdId()];
        if ($user->role() === 'child') {
            $sql .= ' AND owner_id = ?';
            $values[] = $user->id();
        }
        $rows = $this->rows($sql, $values);
        $row = $rows[0] ?? [];
        return [
            'active' => (int) ($row['active_count'] ?? 0),
            'archived' => (int) ($row['archived_count'] ?? 0),
        ];
    }

    /** @return list<array<string, mixed>> */
    private function categories(UserContext $user): array
    {
        $categories = $this->rows(
            'SELECT c.id, c.name, c.is_fallback, c.version, '
            . '(SELECT COUNT(*) FROM lh_inventory ia WHERE ia.household_id = c.household_id '
            . 'AND ia.category_id = c.id AND ia.archived_at IS NULL) AS active_count, '
            . '(SELECT COUNT(*) FROM lh_inventory ir WHERE ir.household_id = c.household_id '
            . 'AND ir.category_id = c.id AND ir.archived_at IS NOT NULL) AS archived_count '
            . 'FROM lh_inventory_categories c WHERE c.household_id = ? ORDER BY c.name_key, c.id',
            [$user->householdId()]
        );
        return array_map(static function (array $category): array {
            $category['id'] = (int) $category['id'];
            $category['is_fallback'] = (int) $category['is_fallback'];
            $category['version'] = (int) $category['version'];
            $category['active_count'] = (int) $category['active_count'];
            $category['archived_count'] = (int) $category['archived_count'];
            return $category;
        }, $categories);
    }

    /** @return array<string, mixed> */
    private function category(UserContext $user, int $id): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, name, is_fallback, version FROM lh_inventory_categories '
            . 'WHERE household_id = ? AND id = ? LIMIT 1'
        );
        $statement->execute([$user->householdId(), $id]);
        $category = $statement->fetch();
        if (!is_array($category)) {
            throw new ApiException(404, 'inventory.category_not_found', 'Inventory category not found.');
        }
        return $category;
    }

    private function assertCategoryNameAvailable(UserContext $user, string $key, ?int $exceptId): void
    {
        $sql = 'SELECT COUNT(*) FROM lh_inventory_categories WHERE household_id = ? AND name_key = ?';
        $parameters = [$user->householdId(), $key];
        if ($exceptId !== null) {
            $sql .= ' AND id <> ?';
            $parameters[] = $exceptId;
        }
        $statement = $this->pdo->prepare($sql);
        $statement->execute($parameters);
        if ((int) $statement->fetchColumn() !== 0) {
            throw new ApiException(409, 'inventory.category_duplicate', 'Inventory category already exists.');
        }
    }

    /** @return list<array<string, mixed>> */
    private function members(UserContext $user): array
    {
        $sql = "SELECT id, username FROM lh_users WHERE household_id = ? AND status = 'active' "
            . 'AND archived_at IS NULL';
        $values = [$user->householdId()];
        if ($user->role() === 'child') {
            $sql .= ' AND id = ?';
            $values[] = $user->id();
        }
        return $this->rows($sql . ' ORDER BY username_key', $values);
    }

    /** @return list<array<string, mixed>> */
    private function documents(UserContext $user): array
    {
        return $this->rows(
            'SELECT id, title FROM lh_documents WHERE household_id = ? AND archived_at IS NULL ORDER BY title_search',
            [$user->householdId()]
        );
    }

    /**
     * @param mixed $categoryId
     * @param mixed $ownerId
     * @param mixed $documentId
     */
    private function assertRelations(UserContext $user, $categoryId, $ownerId, $documentId): void
    {
        $category = $this->pdo->prepare(
            'SELECT COUNT(*) FROM lh_inventory_categories WHERE household_id = ? AND id = ?'
        );
        $category->execute([$user->householdId(), (int) $categoryId]);
        if ((int) $category->fetchColumn() !== 1) {
            throw new ApiException(422, 'inventory.category_not_found', 'Inventory category not found.');
        }
        if ($ownerId !== null) {
            $this->assertActive('lh_users', $user->householdId(), (int) $ownerId, 'inventory.owner_not_found');
        }
        if ($documentId !== null) {
            $this->assertActive(
                'lh_documents',
                $user->householdId(),
                (int) $documentId,
                'inventory.document_not_found'
            );
        }
    }

    private function assertActive(string $table, int $householdId, int $id, string $code): void
    {
        $statement = $this->pdo->prepare(
            'SELECT COUNT(*) FROM ' . $table . ' WHERE household_id = ? AND id = ? AND archived_at IS NULL'
        );
        $statement->execute([$householdId, $id]);
        if ((int) $statement->fetchColumn() !== 1) {
            throw new ApiException(422, $code, 'Referenced resource not found.');
        }
    }

    private function assertManager(UserContext $user): void
    {
        if (!Authorization::canManageHousehold($user)) {
            throw new ApiException(403, 'authorization.denied', 'This role cannot change household inventory.');
        }
    }

    private function attachmentJoin(): string
    {
        return "LEFT JOIN lh_attachments a ON a.id = (SELECT MAX(ax.id) FROM lh_attachments ax "
            . "WHERE ax.household_id = i.household_id AND ax.owner_type = 'inventory' AND ax.owner_id = i.id "
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
        return $rows;
    }

    private function assertChanged(\PDOStatement $statement): void
    {
        if ($statement->rowCount() !== 1) {
            throw new ApiException(409, 'version.conflict', 'The inventory item changed; reload and retry.');
        }
    }
}
