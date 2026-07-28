<?php

/**
 * Persists household-scoped users and protects the final active administrator.
 */

declare(strict_types=1);

namespace LifeHub\Identity;

use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Text\SearchKey;
use PDO;
use PDOException;

final class UserRepository
{
    /** @var PDO */
    private $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /** @return array<string, mixed>|null */
    public function findForLogin(string $username): ?array
    {
        $statement = $this->pdo->prepare(
            "SELECT * FROM lh_users WHERE username_key = ? AND status = 'active' AND archived_at IS NULL LIMIT 1"
        );
        $statement->execute([SearchKey::from($username)]);
        $row = $statement->fetch();

        return is_array($row) ? $row : null;
    }

    /** @return array<string, mixed>|null */
    public function find(int $householdId, int $id): ?array
    {
        $statement = $this->pdo->prepare('SELECT * FROM lh_users WHERE household_id = ? AND id = ? LIMIT 1');
        $statement->execute([$householdId, $id]);
        $row = $statement->fetch();

        return is_array($row) ? $row : null;
    }

    /** @return array<string, mixed>|null */
    public function findActive(int $householdId, int $id): ?array
    {
        $statement = $this->pdo->prepare(
            "SELECT id, household_id, username, role, session_version FROM lh_users "
            . "WHERE household_id = ? AND id = ? "
            . "AND status = 'active' AND archived_at IS NULL LIMIT 1"
        );
        $statement->execute([$householdId, $id]);
        $row = $statement->fetch();
        return is_array($row) ? $row : null;
    }

    /** @return list<array<string, mixed>> */
    public function list(int $householdId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, username, role, status, created_at, updated_at, archived_at, version '
            . 'FROM lh_users WHERE household_id = ? ORDER BY username_key'
        );
        $statement->execute([$householdId]);
        $rows = $statement->fetchAll();
        return is_array($rows) ? $rows : [];
    }

    /** @return list<array<string, mixed>> */
    public function calendarAssignments(int $householdId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT user_id, calendar_id FROM lh_user_calendars '
            . 'WHERE household_id = ? ORDER BY user_id, calendar_id'
        );
        $statement->execute([$householdId]);
        $rows = $statement->fetchAll();
        return is_array($rows) ? $rows : [];
    }

    public function create(int $householdId, string $username, string $password, string $role): int
    {
        $now = gmdate('Y-m-d H:i:s');
        $statement = $this->pdo->prepare(
            'INSERT INTO lh_users '
            . '(household_id, username, username_key, password_hash, role, status, created_at, updated_at) '
            . "VALUES (?, ?, ?, ?, ?, 'active', ?, ?)"
        );
        try {
            $statement->execute([
                $householdId,
                $username,
                SearchKey::from($username),
                password_hash($password, PASSWORD_BCRYPT),
                $role,
                $now,
                $now,
            ]);
        } catch (PDOException $exception) {
            if ((string) $exception->getCode() === '23000') {
                throw new ApiException(409, 'user.username_exists', 'Username already exists.');
            }
            throw $exception;
        }

        return (int) $this->pdo->lastInsertId();
    }

    public function updatePassword(int $id, string $hash): int
    {
        $statement = $this->pdo->prepare(
            'UPDATE lh_users SET password_hash = ?, updated_at = ?, '
            . 'version = version + 1, session_version = session_version + 1 '
            . 'WHERE id = ?'
        );
        $statement->execute([$hash, gmdate('Y-m-d H:i:s'), $id]);
        $version = $this->pdo->prepare('SELECT session_version FROM lh_users WHERE id = ? LIMIT 1');
        $version->execute([$id]);
        return (int) $version->fetchColumn();
    }

    public function resetPassword(int $householdId, int $id, string $password, int $version): bool
    {
        if ($this->find($householdId, $id) === null) {
            throw new ApiException(404, 'user.not_found', 'User not found.');
        }
        $statement = $this->pdo->prepare(
            'UPDATE lh_users SET password_hash = ?, updated_at = ?, '
            . 'version = version + 1, session_version = session_version + 1 '
            . 'WHERE household_id = ? AND id = ? AND version = ?'
        );
        $statement->execute([
            password_hash($password, PASSWORD_BCRYPT),
            gmdate('Y-m-d H:i:s'),
            $householdId,
            $id,
            $version,
        ]);
        return $statement->rowCount() === 1;
    }

    public function setCalendarAssignment(
        int $householdId,
        int $userId,
        int $calendarId,
        int $actorId,
        bool $assigned
    ): bool {
        if ($this->find($householdId, $userId) === null) {
            throw new ApiException(404, 'user.not_found', 'User not found.');
        }
        $calendar = $this->pdo->prepare(
            'SELECT id FROM lh_calendars WHERE household_id = ? AND id = ? LIMIT 1'
        );
        $calendar->execute([$householdId, $calendarId]);
        if ($calendar->fetchColumn() === false) {
            throw new ApiException(404, 'calendar.not_found', 'Calendar not found.');
        }
        $existing = $this->pdo->prepare(
            'SELECT id FROM lh_user_calendars '
            . 'WHERE household_id = ? AND user_id = ? AND calendar_id = ? LIMIT 1'
        );
        $existing->execute([$householdId, $userId, $calendarId]);
        $row = $existing->fetch();
        if ($assigned && !is_array($row)) {
            $insert = $this->pdo->prepare(
                'INSERT IGNORE INTO lh_user_calendars '
                . '(household_id, user_id, calendar_id, created_at, created_by) VALUES (?, ?, ?, ?, ?)'
            );
            $insert->execute([$householdId, $userId, $calendarId, gmdate('Y-m-d H:i:s'), $actorId]);
            return $insert->rowCount() === 1;
        }
        if (!$assigned && is_array($row)) {
            $delete = $this->pdo->prepare('DELETE FROM lh_user_calendars WHERE id = ?');
            $delete->execute([(int) $row['id']]);
            return $delete->rowCount() === 1;
        }
        return false;
    }

    public function update(int $householdId, int $id, string $role, string $status, int $version): bool
    {
        $this->pdo->exec('LOCK TABLES lh_users WRITE');
        try {
            $current = $this->find($householdId, $id);
            if ($current === null) {
                throw new ApiException(404, 'user.not_found', 'User not found.');
            }
            if ($current['role'] === 'admin' && ($role !== 'admin' || $status !== 'active')) {
                $this->assertAnotherAdmin($householdId, $id);
            }
            $statement = $this->pdo->prepare(
                'UPDATE lh_users SET role = ?, status = ?, updated_at = ?, version = version + 1, '
                . 'session_version = session_version + 1 '
                . 'WHERE household_id = ? AND id = ? AND version = ?'
            );
            $statement->execute([$role, $status, gmdate('Y-m-d H:i:s'), $householdId, $id, $version]);
            return $statement->rowCount() === 1;
        } finally {
            $this->pdo->exec('UNLOCK TABLES');
        }
    }

    private function assertAnotherAdmin(int $householdId, int $excludedId): void
    {
        $statement = $this->pdo->prepare(
            "SELECT COUNT(*) FROM lh_users WHERE household_id = ? AND id <> ? "
            . "AND role = 'admin' AND status = 'active' AND archived_at IS NULL"
        );
        $statement->execute([$householdId, $excludedId]);
        if ((int) $statement->fetchColumn() === 0) {
            throw new ApiException(409, 'user.last_admin', 'The final active administrator cannot be removed.');
        }
    }
}
