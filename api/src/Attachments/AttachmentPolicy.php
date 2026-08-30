<?php

/**
 * Applies household, role, and owner-record checks to attachment access.
 */

declare(strict_types=1);

namespace LifeHub\Attachments;

use LifeHub\Shared\Auth\Authorization;
use LifeHub\Shared\Auth\UserContext;
use PDO;

final class AttachmentPolicy
{
    /** @var PDO */ private $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function canUpload(UserContext $user, string $ownerType, int $ownerId): bool
    {
        if (Authorization::canManageHousehold($user)) {
            return $this->recordExists($user, $ownerType, $ownerId, false);
        }
        return $this->recordExists($user, $ownerType, $ownerId, true);
    }

    /** @param array<string, mixed> $attachment */
    public function canRead(UserContext $user, array $attachment): bool
    {
        if ((int) $attachment['household_id'] !== $user->householdId()) {
            return false;
        }
        if (Authorization::canManageHousehold($user)) {
            return true;
        }
        if (in_array((string) $attachment['owner_type'], ['product', 'price'], true)) {
            return $this->recordExists(
                $user,
                (string) $attachment['owner_type'],
                (int) $attachment['owner_id'],
                false
            );
        }
        return $this->recordExists(
            $user,
            (string) $attachment['owner_type'],
            (int) $attachment['owner_id'],
            true,
            (string) $attachment['owner_type'] === 'inventory'
        );
    }

    private function recordExists(
        UserContext $user,
        string $type,
        int $id,
        bool $owned,
        bool $includeArchived = false
    ): bool {
        $definitions = [
            'task' => ['lh_tasks', '(created_by = ? OR assigned_to = ?)'],
            'note' => ['lh_notes', 'created_by = ?'],
            'document' => ['lh_documents', 'owner_id = ?'],
            'inventory' => ['lh_inventory', 'owner_id = ?'],
            'goal' => ['lh_goals', 'owner_id = ?'],
            'recipe' => ['lh_recipes', 'created_by = ?'],
            'product' => ['lh_products', 'created_by = ?'],
            'price' => ['lh_prices', 'created_by = ?'],
        ];
        if (!isset($definitions[$type])) {
            return false;
        }
        [$table, $ownerClause] = $definitions[$type];
        $sql = 'SELECT COUNT(*) FROM ' . $table . ' WHERE household_id = ? AND id = ?';
        if (!$includeArchived) {
            $sql .= ' AND archived_at IS NULL';
        }
        $values = [$user->householdId(), $id];
        if ($owned) {
            $sql .= ' AND ' . $ownerClause;
            $values[] = $user->id();
            if ($type === 'task') {
                $values[] = $user->id();
            }
        }
        $statement = $this->pdo->prepare($sql);
        $statement->execute($values);
        return (int) $statement->fetchColumn() === 1;
    }
}
