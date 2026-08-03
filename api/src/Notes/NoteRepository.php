<?php

/**
 * Reads and persists the shared household note workspace.
 */

declare(strict_types=1);

namespace LifeHub\Notes;

use LifeHub\Shared\Auth\Authorization;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use PDO;

final class NoteRepository
{
    /** @var PDO */ private $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /** @return array<string, mixed> */
    public function overview(UserContext $user, bool $archived): array
    {
        return [
            'items' => $this->items($user, null, $archived),
            'members' => $this->members($user),
            'can_create' => true,
            'archived' => $archived,
        ];
    }

    /** @return array<string, mixed> */
    public function detail(UserContext $user, int $id): array
    {
        foreach ($this->items($user, $id, null) as $item) {
            return $item;
        }
        throw new ApiException(404, 'note.not_found', 'Note not found.');
    }

    /** @param array<string, mixed> $note */
    public function create(UserContext $user, array $note): int
    {
        $now = gmdate('Y-m-d H:i:s');
        $statement = $this->pdo->prepare(
            'INSERT INTO lh_notes (household_id, title, title_search, body, visibility, color_hex, '
            . 'is_pinned, created_by, created_at, updated_by, updated_at) '
            . 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([
            $user->householdId(), $note['title'], $this->searchKey((string) $note['title']), $note['body'],
            'household', $note['color'], $note['pinned'] ? 1 : 0, $user->id(), $now, $user->id(), $now,
        ]);
        return (int) $this->pdo->lastInsertId();
    }

    /** @param array<string, mixed> $note */
    public function update(UserContext $user, int $id, int $version, array $note): void
    {
        $this->assertEditable($user, $this->detail($user, $id));
        $statement = $this->pdo->prepare(
            'UPDATE lh_notes SET title = ?, title_search = ?, body = ?, color_hex = ?, is_pinned = ?, '
            . 'updated_by = ?, updated_at = ?, version = version + 1 '
            . 'WHERE household_id = ? AND id = ? AND version = ? AND archived_at IS NULL'
        );
        $statement->execute([
            $note['title'], $this->searchKey((string) $note['title']), $note['body'], $note['color'],
            $note['pinned'] ? 1 : 0, $user->id(), gmdate('Y-m-d H:i:s'),
            $user->householdId(), $id, $version,
        ]);
        $this->assertChanged($statement);
    }

    public function setPinned(UserContext $user, int $id, int $version, bool $pinned): void
    {
        $this->assertEditable($user, $this->detail($user, $id));
        $statement = $this->pdo->prepare(
            'UPDATE lh_notes SET is_pinned = ?, updated_by = ?, updated_at = ?, version = version + 1 '
            . 'WHERE household_id = ? AND id = ? AND version = ? AND archived_at IS NULL'
        );
        $statement->execute([
            $pinned ? 1 : 0, $user->id(), gmdate('Y-m-d H:i:s'),
            $user->householdId(), $id, $version,
        ]);
        $this->assertChanged($statement);
    }

    public function setArchived(UserContext $user, int $id, int $version, bool $archived): void
    {
        $item = $this->detail($user, $id);
        $this->assertEditable($user, $item);
        $expected = $archived ? 'archived_at IS NULL' : 'archived_at IS NOT NULL';
        $statement = $this->pdo->prepare(
            'UPDATE lh_notes SET archived_at = ?, updated_by = ?, updated_at = ?, version = version + 1 '
            . 'WHERE household_id = ? AND id = ? AND version = ? AND ' . $expected
        );
        $statement->execute([
            $archived ? gmdate('Y-m-d H:i:s') : null, $user->id(), gmdate('Y-m-d H:i:s'),
            $user->householdId(), $id, $version,
        ]);
        $this->assertChanged($statement);
    }

    public function removeImage(UserContext $user, int $id): void
    {
        $item = $this->detail($user, $id);
        $this->assertEditable($user, $item);
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
    private function items(UserContext $user, ?int $id, ?bool $archived): array
    {
        $conditions = ['n.household_id = ?'];
        $values = [$user->householdId()];
        if ($id !== null) {
            $conditions[] = 'n.id = ?';
            $values[] = $id;
        }
        if ($archived !== null) {
            $conditions[] = $archived ? 'n.archived_at IS NOT NULL' : 'n.archived_at IS NULL';
        }
        if ($user->role() === 'child') {
            $conditions[] = 'n.created_by = ?';
            $values[] = $user->id();
        }
        $items = $this->rows(
            'SELECT n.id, n.title, n.body, n.color_hex, n.is_pinned, n.visibility, n.created_by, '
            . 'n.created_at, n.updated_by, n.updated_at, n.archived_at, n.version, '
            . 'u.username AS author_name, a.id AS image_attachment_id FROM lh_notes n '
            . 'JOIN lh_users u ON u.household_id = n.household_id AND u.id = n.created_by '
            . $this->attachmentJoin() . ' WHERE ' . implode(' AND ', $conditions)
            . ' ORDER BY n.is_pinned DESC, n.updated_at DESC, n.id DESC',
            $values
        );
        foreach ($items as &$item) {
            $item['can_edit'] = Authorization::canManageHousehold($user)
                || (int) $item['created_by'] === $user->id();
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

    /** @param array<string, mixed> $item */
    private function assertEditable(UserContext $user, array $item): void
    {
        if (!Authorization::canManageHousehold($user) && (int) $item['created_by'] !== $user->id()) {
            throw new ApiException(403, 'authorization.denied', 'This role cannot change the note.');
        }
    }

    private function attachmentJoin(): string
    {
        return "LEFT JOIN lh_attachments a ON a.id = (SELECT MAX(ax.id) FROM lh_attachments ax "
            . "WHERE ax.household_id = n.household_id AND ax.owner_type = 'note' AND ax.owner_id = n.id "
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
            throw new ApiException(409, 'version.conflict', 'The note changed; reload and retry.');
        }
    }
}
