<?php

/**
 * Persists household tasks with archive semantics and optimistic locking.
 */

declare(strict_types=1);

namespace LifeHub\Tasks;

use LifeHub\Shared\Auth\Authorization;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Text\SearchKey;
use PDO;

final class TaskRepository
{
    /** @var PDO */
    private $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * @param array<string, mixed> $filters
     * @return list<array<string, mixed>>
     */
    public function list(UserContext $user, bool $archived, array $filters = []): array
    {
        $archiveClause = $archived ? 't.archived_at IS NOT NULL' : 't.archived_at IS NULL';
        $params = [$user->householdId()];
        $policyClause = '';
        if (!Authorization::canManageHousehold($user)) {
            $policyClause = ' AND (t.created_by = ? OR t.assigned_to = ?)';
            $params[] = $user->id();
            $params[] = $user->id();
        }
        if (isset($filters['status'])) {
            $policyClause .= ' AND t.status = ?';
            $params[] = $filters['status'];
        }
        if (isset($filters['assignedTo'])) {
            $policyClause .= ' AND t.assigned_to = ?';
            $params[] = $filters['assignedTo'];
        }
        if (isset($filters['dueFrom'])) {
            $policyClause .= ' AND t.due_date >= ?';
            $params[] = $filters['dueFrom'];
        }
        if (isset($filters['dueTo'])) {
            $policyClause .= ' AND t.due_date <= ?';
            $params[] = $filters['dueTo'];
        }
        $statement = $this->pdo->prepare(
            'SELECT t.*, u.username AS assigned_username FROM lh_tasks t LEFT JOIN lh_users u '
            . 'ON u.household_id = t.household_id AND u.id = t.assigned_to '
            . 'WHERE t.household_id = ? AND ' . $archiveClause . $policyClause
            . ' ORDER BY t.due_date IS NULL, t.due_date, t.id DESC'
        );
        $statement->execute($params);
        $rows = $statement->fetchAll();
        return $rows;
    }

    /** @return list<array{id:int, username:string}> */
    public function members(UserContext $user): array
    {
        $sql = 'SELECT id, username FROM lh_users WHERE household_id = ? AND status = ?';
        $values = [$user->householdId(), 'active'];
        if (!Authorization::canManageHousehold($user)) {
            $sql .= ' AND id = ?';
            $values[] = $user->id();
        }
        $sql .= ' ORDER BY username_key, id';
        $statement = $this->pdo->prepare($sql);
        $statement->execute($values);
        $rows = $statement->fetchAll();
        return $rows;
    }

    /** @return array<string, mixed> */
    public function get(UserContext $user, int $id): array
    {
        $statement = $this->pdo->prepare('SELECT * FROM lh_tasks WHERE household_id = ? AND id = ? LIMIT 1');
        $statement->execute([$user->householdId(), $id]);
        $task = $statement->fetch();
        if (!is_array($task) || !Authorization::canReadTask($user, $task)) {
            throw new ApiException(404, 'task.not_found', 'Task not found.');
        }

        return $task;
    }

    public function create(
        UserContext $user,
        string $title,
        ?string $description,
        ?int $assignedTo,
        string $priority,
        ?string $dueDate
    ): int {
        if ($user->role() === 'child' && $assignedTo !== null && $assignedTo !== $user->id()) {
            throw new ApiException(403, 'task.assignment_denied', 'Children may only assign tasks to themselves.');
        }
        $now = gmdate('Y-m-d H:i:s');
        $statement = $this->pdo->prepare(
            'INSERT INTO lh_tasks '
            . '(household_id, title, title_search, description, assigned_to, status, priority, due_date, '
            . 'created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([
            $user->householdId(), $title, SearchKey::from($title, 255), $description, $assignedTo,
            'open', $priority, $dueDate, $user->id(), $now, $user->id(), $now,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    /** @return array<string,mixed>|null The completed snapshot, only for a successful transition. */
    public function complete(UserContext $user, int $id, int $version): ?array
    {
        $task = $this->get($user, $id);
        if ((string) $task['status'] === 'completed') {
            return null;
        }
        $this->mutate($user, $id, $version, "status = 'completed'");
        return array_replace($task, ['status' => 'completed', 'version' => $version + 1]);
    }

    public function archive(UserContext $user, int $id, int $version): bool
    {
        $this->get($user, $id);
        return $this->mutate($user, $id, $version, 'archived_at = ?, archived_by = ?', [
            gmdate('Y-m-d H:i:s'), $user->id(),
        ]);
    }

    public function restore(UserContext $user, int $id, int $version): bool
    {
        $this->get($user, $id);
        return $this->mutate($user, $id, $version, 'archived_at = NULL, archived_by = NULL');
    }

    /**
     * @param array<string, mixed> $values
     * @return array<string,mixed>|null The completed snapshot, only for a successful transition.
     */
    public function update(UserContext $user, int $id, int $version, array $values): ?array
    {
        $task = $this->get($user, $id);
        if ($user->role() === 'child' && isset($values['assigned_to']) && $values['assigned_to'] !== $user->id()) {
            throw new ApiException(403, 'task.assignment_denied', 'Children may only assign tasks to themselves.');
        }
        if (isset($values['title'])) {
            $values['title_search'] = SearchKey::from((string) $values['title'], 255);
        }
        $assignments = [];
        foreach (array_keys($values) as $column) {
            $assignments[] = $column . ' = ?';
        }
        $changes = implode(', ', $assignments);
        $this->mutate($user, $id, $version, $changes, array_values($values));
        return ($values['status'] ?? null) === 'completed' && $task['status'] !== 'completed'
            ? array_replace($task, $values, ['version' => $version + 1]) : null;
    }

    /** @param list<mixed> $values */
    private function mutate(UserContext $user, int $id, int $version, string $changes, array $values = []): bool
    {
        $statement = $this->pdo->prepare(
            'UPDATE lh_tasks SET ' . $changes . ', updated_by = ?, updated_at = ?, version = version + 1 '
            . 'WHERE household_id = ? AND id = ? AND version = ?'
            . ($user->role() === 'child' ? ' AND (created_by = ? OR assigned_to = ?)' : '')
        );
        $parameters = array_merge($values, [
            $user->id(), gmdate('Y-m-d H:i:s'), $user->householdId(), $id, $version,
        ]);
        if ($user->role() === 'child') {
            $parameters[] = $user->id();
            $parameters[] = $user->id();
        }
        $statement->execute($parameters);
        if ($statement->rowCount() !== 1) {
            throw new ApiException(409, 'version.conflict', 'The task was modified by another request.');
        }

        return true;
    }
}
