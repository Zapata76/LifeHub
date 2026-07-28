<?php

/**
 * Reads and persists the aggregate household inventory workspace.
 */

declare(strict_types=1);

namespace LifeHub\Inventory;

use LifeHub\Shared\Auth\Authorization;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use PDO;

final class InventoryRepository
{
    /** @var PDO */ private $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /** @return array<string, mixed> */
    public function overview(UserContext $user): array
    {
        $items = $this->items($user);
        return [
            'items' => $items,
            'categories' => array_values(array_map(
                function (array $row): string {
                    return (string) $row['category_text'];
                },
                $this->rows(
                    "SELECT DISTINCT category_text FROM lh_inventory WHERE household_id = ? "
                    . "AND archived_at IS NULL AND category_text IS NOT NULL AND category_text <> '' "
                    . 'ORDER BY category_text',
                    [$user->householdId()]
                )
            )),
            'members' => $this->members($user),
            'documents' => Authorization::canManageHousehold($user) ? $this->documents($user) : [],
            'can_manage' => Authorization::canManageHousehold($user),
        ];
    }

    /** @return array<string, mixed> */
    public function detail(UserContext $user, int $id): array
    {
        foreach ($this->items($user, $id) as $item) {
            return $item;
        }
        throw new ApiException(404, 'inventory.not_found', 'Inventory item not found.');
    }

    /** @param array<string, mixed> $item */
    public function create(UserContext $user, array $item): int
    {
        $this->assertManager($user);
        $this->assertRelations($user, $item['ownerId'], $item['documentId']);
        $now = gmdate('Y-m-d H:i:s');
        $statement = $this->pdo->prepare(
            'INSERT INTO lh_inventory (household_id, owner_id, document_id, name, name_search, '
            . 'category_text, quantity, unit_code, location, status, notes, purchase_date, warranty_expiry, '
            . 'created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([
            $user->householdId(), $item['ownerId'], $item['documentId'], $item['name'],
            $this->searchKey((string) $item['name']), $item['category'], $item['quantity'], $item['unit'],
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
        $this->assertRelations($user, $item['ownerId'], $item['documentId']);
        $statement = $this->pdo->prepare(
            'UPDATE lh_inventory SET owner_id = ?, document_id = ?, name = ?, name_search = ?, '
            . 'category_text = ?, quantity = ?, unit_code = ?, location = ?, notes = ?, purchase_date = ?, '
            . 'warranty_expiry = ?, updated_at = ?, version = version + 1 '
            . 'WHERE household_id = ? AND id = ? AND version = ? AND archived_at IS NULL'
        );
        $statement->execute([
            $item['ownerId'], $item['documentId'], $item['name'], $this->searchKey((string) $item['name']),
            $item['category'], $item['quantity'], $item['unit'], $item['location'], $item['notes'],
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

    /** @return list<array<string, mixed>> */
    private function items(UserContext $user, ?int $id = null): array
    {
        $conditions = ['i.household_id = ?', 'i.archived_at IS NULL'];
        $values = [$user->householdId()];
        if ($id !== null) {
            $conditions[] = 'i.id = ?';
            $values[] = $id;
        }
        if ($user->role() === 'child') {
            $conditions[] = 'i.owner_id = ?';
            $values[] = $user->id();
        }
        $items = $this->rows(
            'SELECT i.id, i.owner_id, i.document_id, i.name, i.category_text, i.quantity, i.unit_code, '
            . 'i.location, i.status, i.notes, i.purchase_date, i.warranty_expiry, i.created_by, i.version, '
            . 'u.username AS owner_name, d.title AS document_title, d.owner_id AS document_owner_id, '
            . 'a.id AS image_attachment_id '
            . 'FROM lh_inventory i LEFT JOIN lh_users u ON u.household_id = i.household_id '
            . 'AND u.id = i.owner_id LEFT JOIN lh_documents d ON d.household_id = i.household_id '
            . 'AND d.id = i.document_id AND d.archived_at IS NULL ' . $this->attachmentJoin()
            . ' WHERE ' . implode(' AND ', $conditions) . ' ORDER BY i.name_search, i.id',
            $values
        );
        foreach ($items as &$item) {
            if ($user->role() === 'child' && (int) $item['document_owner_id'] !== $user->id()) {
                $item['document_id'] = null;
                $item['document_title'] = null;
            }
            unset($item['document_owner_id']);
            $item['can_edit'] = Authorization::canManageHousehold($user);
        }
        unset($item);
        return $items;
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
     * @param mixed $ownerId
     * @param mixed $documentId
     */
    private function assertRelations(UserContext $user, $ownerId, $documentId): void
    {
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
        return is_array($rows) ? $rows : [];
    }

    private function assertChanged(\PDOStatement $statement): void
    {
        if ($statement->rowCount() !== 1) {
            throw new ApiException(409, 'version.conflict', 'The inventory item changed; reload and retry.');
        }
    }
}
