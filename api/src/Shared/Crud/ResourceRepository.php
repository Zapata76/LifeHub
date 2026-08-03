<?php

/**
 * Executes whitelisted household CRUD with optimistic locking.
 */

declare(strict_types=1);

namespace LifeHub\Shared\Crud;

use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use PDO;

final class ResourceRepository
{
    /** @var PDO */ private $pdo;
    /** @var ResourceDefinition */ private $definition;

    public function __construct(PDO $pdo, ResourceDefinition $definition)
    {
        $this->pdo = $pdo;
        $this->definition = $definition;
    }

    /** @return list<array<string, mixed>> */
    public function list(UserContext $user): array
    {
        $sql = 'SELECT * FROM ' . $this->definition->table()
            . ' WHERE household_id = ? ORDER BY id DESC';
        $statement = $this->pdo->prepare($sql);
        $statement->execute([$user->householdId()]);
        $rows = $statement->fetchAll();
        return $rows;
    }

    /** @return array<string, mixed> */
    public function find(UserContext $user, int $id): array
    {
        $statement = $this->pdo->prepare(
            'SELECT * FROM ' . $this->definition->table() . ' WHERE household_id = ? AND id = ? LIMIT 1'
        );
        $statement->execute([$user->householdId(), $id]);
        $row = $statement->fetch();
        if (!is_array($row)) {
            throw new ApiException(404, $this->definition->entity() . '.not_found', 'Resource not found.');
        }

        return $row;
    }

    /** @param array<string, mixed> $values */
    public function create(UserContext $user, array $values): int
    {
        $now = gmdate('Y-m-d H:i:s');
        $values['household_id'] = $user->householdId();
        $values['created_by'] = $user->id();
        $values['created_at'] = $now;
        if ($this->definition->hasUpdatedAt()) {
            $values['updated_at'] = $now;
        }
        $columns = array_keys($values);
        $statement = $this->pdo->prepare(
            'INSERT INTO ' . $this->definition->table() . ' (' . implode(', ', $columns) . ') VALUES ('
            . implode(', ', array_fill(0, count($columns), '?')) . ')'
        );
        $statement->execute(array_values($values));

        return (int) $this->pdo->lastInsertId();
    }

    /** @param array<string, mixed> $values */
    public function update(UserContext $user, int $id, int $version, array $values): void
    {
        $this->find($user, $id);
        if ($this->definition->hasUpdatedAt()) {
            $values['updated_at'] = gmdate('Y-m-d H:i:s');
        }
        $assignments = [];
        foreach (array_keys($values) as $column) {
            $assignments[] = $column . ' = ?';
        }
        $statement = $this->pdo->prepare(
            'UPDATE ' . $this->definition->table() . ' SET ' . implode(', ', $assignments)
            . ', version = version + 1 WHERE household_id = ? AND id = ? AND version = ?'
        );
        $parameters = array_merge(array_values($values), [$user->householdId(), $id, $version]);
        $statement->execute($parameters);
        if ($statement->rowCount() !== 1) {
            throw new ApiException(409, 'version.conflict', 'The resource was modified by another request.');
        }
    }

    public function deleteCalendar(UserContext $user, int $id, int $version): void
    {
        if ($this->definition->entity() !== 'calendar') {
            throw new ApiException(405, 'resource.not_deletable', 'This resource cannot be deleted.');
        }

        $this->pdo->exec('LOCK TABLES lh_calendars WRITE, lh_user_calendars WRITE');
        try {
            $current = $this->pdo->prepare(
                'SELECT version FROM lh_calendars WHERE household_id = ? AND id = ? LIMIT 1'
            );
            $current->execute([$user->householdId(), $id]);
            $currentVersion = $current->fetchColumn();
            if ($currentVersion === false) {
                throw new ApiException(404, 'calendar.not_found', 'Calendar not found.');
            }
            if ((int) $currentVersion !== $version) {
                throw new ApiException(409, 'version.conflict', 'The resource was modified by another request.');
            }

            $links = $this->pdo->prepare(
                'DELETE FROM lh_user_calendars WHERE household_id = ? AND calendar_id = ?'
            );
            $links->execute([$user->householdId(), $id]);
            $calendar = $this->pdo->prepare(
                'DELETE FROM lh_calendars WHERE household_id = ? AND id = ? AND version = ?'
            );
            $calendar->execute([$user->householdId(), $id, $version]);
            if ($calendar->rowCount() !== 1) {
                throw new ApiException(409, 'version.conflict', 'The resource was modified by another request.');
            }
        } finally {
            $this->pdo->exec('UNLOCK TABLES');
        }
    }
}
