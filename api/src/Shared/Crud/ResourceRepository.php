<?php

/**
 * Executes whitelisted household CRUD with child scoping and optimistic locking.
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
    public function list(UserContext $user, bool $archived): array
    {
        $conditions = ['household_id = ?'];
        $values = [$user->householdId()];
        if ($this->definition->archivable()) {
            $conditions[] = $archived ? 'archived_at IS NOT NULL' : 'archived_at IS NULL';
        }
        $this->addChildScope($user, $conditions, $values);
        $sql = 'SELECT * FROM ' . $this->definition->table()
            . ' WHERE ' . implode(' AND ', $conditions)
            . ' ORDER BY id DESC';
        $statement = $this->pdo->prepare($sql);
        $statement->execute($values);
        $rows = $statement->fetchAll();
        return is_array($rows) ? $rows : [];
    }

    /** @return array<string, mixed> */
    public function find(UserContext $user, int $id): array
    {
        $conditions = ['household_id = ?', 'id = ?'];
        $values = [$user->householdId(), $id];
        $this->addChildScope($user, $conditions, $values);
        $statement = $this->pdo->prepare(
            'SELECT * FROM ' . $this->definition->table() . ' WHERE ' . implode(' AND ', $conditions) . ' LIMIT 1'
        );
        $statement->execute($values);
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
        if ($this->definition->hasCreatedBy()) {
            $values['created_by'] = $user->id();
        }
        $values['created_at'] = $now;
        if ($this->definition->hasUpdatedAt()) {
            $values['updated_at'] = $now;
        }
        if ($this->definition->hasUpdatedBy()) {
            $values['updated_by'] = $user->id();
        }
        $ownerField = $this->definition->childOwnerField();
        if ($user->role() === 'child' && $ownerField !== null) {
            $values[$ownerField] = $user->id();
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
        $ownerField = $this->definition->childOwnerField();
        if ($user->role() === 'child' && $ownerField !== null) {
            $values[$ownerField] = $user->id();
        }
        if ($this->definition->hasUpdatedAt()) {
            $values['updated_at'] = gmdate('Y-m-d H:i:s');
        }
        if ($this->definition->hasUpdatedBy()) {
            $values['updated_by'] = $user->id();
        }
        $assignments = [];
        foreach (array_keys($values) as $column) {
            $assignments[] = $column . ' = ?';
        }
        $statement = $this->pdo->prepare(
            'UPDATE ' . $this->definition->table() . ' SET ' . implode(', ', $assignments)
            . ', version = version + 1 WHERE household_id = ? AND id = ? AND version = ?'
            . $this->childMutationClause($user)
        );
        $parameters = array_merge(array_values($values), [$user->householdId(), $id, $version]);
        $this->addChildMutationParameter($user, $parameters);
        $statement->execute($parameters);
        if ($statement->rowCount() !== 1) {
            throw new ApiException(409, 'version.conflict', 'The resource was modified by another request.');
        }
    }

    public function setArchived(UserContext $user, int $id, int $version, bool $archived): void
    {
        if (!$this->definition->archivable()) {
            throw new ApiException(405, 'resource.not_archivable', 'This resource cannot be archived.');
        }
        $this->find($user, $id);
        $statement = $this->pdo->prepare(
            'UPDATE ' . $this->definition->table() . ' SET archived_at = ?, version = version + 1 '
            . 'WHERE household_id = ? AND id = ? AND version = ?'
            . $this->childMutationClause($user)
        );
        $parameters = [
            $archived ? gmdate('Y-m-d H:i:s') : null,
            $user->householdId(),
            $id,
            $version,
        ];
        $this->addChildMutationParameter($user, $parameters);
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

    /**
     * @param list<string> $conditions
     * @param list<int> $values
     */
    private function addChildScope(UserContext $user, array &$conditions, array &$values): void
    {
        if ($user->role() !== 'child') {
            return;
        }
        $ownerField = $this->definition->childOwnerField();
        if ($ownerField === null) {
            return;
        }
        $conditions[] = $ownerField . ' = ?';
        $values[] = $user->id();
    }

    private function childMutationClause(UserContext $user): string
    {
        return $user->role() === 'child' && $this->definition->childOwnerField() !== null
            ? ' AND ' . $this->definition->childOwnerField() . ' = ?'
            : '';
    }

    /** @param list<mixed> $parameters */
    private function addChildMutationParameter(UserContext $user, array &$parameters): void
    {
        if ($user->role() === 'child' && $this->definition->childOwnerField() !== null) {
            $parameters[] = $user->id();
        }
    }
}
