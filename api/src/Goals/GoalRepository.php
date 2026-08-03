<?php

/**
 * Persists the Goals & Habits aggregate and its daily progress history.
 */

declare(strict_types=1);

namespace LifeHub\Goals;

use LifeHub\Shared\Auth\Authorization;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use PDO;

final class GoalRepository
{
    /** @var PDO */ private $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /** @return array<string, mixed> */
    public function overview(UserContext $user): array
    {
        $goals = $this->rows(
            'SELECT g.id, g.owner_id, g.title, g.description, g.start_date, g.end_date, g.status, '
            . 'g.created_at, g.version, u.username AS owner_name FROM lh_goals g '
            . 'LEFT JOIN lh_users u ON u.household_id = g.household_id AND u.id = g.owner_id '
            . 'WHERE g.household_id = ? AND g.archived_at IS NULL ORDER BY g.created_at DESC, g.id DESC',
            [$user->householdId()]
        );
        foreach ($goals as &$goal) {
            $goal['trackers'] = $this->trackers($user->householdId(), (int) $goal['id']);
            $goal['can_edit'] = Authorization::canManageHousehold($user);
            $goal['can_log'] = Authorization::canManageHousehold($user)
                || (int) $goal['owner_id'] === $user->id();
        }
        unset($goal);
        return [
            'goals' => $goals,
            'members' => $this->rows(
                "SELECT id, username, role FROM lh_users WHERE household_id = ? AND status = 'active' "
                . 'AND archived_at IS NULL ORDER BY username_key, id',
                [$user->householdId()]
            ),
        ];
    }

    /**
     * @param array<string, mixed> $goal
     * @param list<array<string, mixed>> $trackers
     */
    public function create(UserContext $user, array $goal, array $trackers): int
    {
        $this->assertOwner($user->householdId(), (int) $goal['ownerId']);
        $now = gmdate('Y-m-d H:i:s');
        $statement = $this->pdo->prepare(
            'INSERT INTO lh_goals (household_id, owner_id, title, description, start_date, end_date, status, '
            . 'created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([
            $user->householdId(), $goal['ownerId'], $goal['title'], $goal['description'],
            $goal['startDate'], $goal['endDate'], $goal['status'], $user->id(), $now, $now,
        ]);
        $id = (int) $this->pdo->lastInsertId();
        $this->replaceTrackers($user->householdId(), $id, $trackers, $now);
        return $id;
    }

    /**
     * @param array<string, mixed> $goal
     * @param list<array<string, mixed>> $trackers
     */
    public function update(UserContext $user, int $id, int $version, array $goal, array $trackers): void
    {
        $this->assertOwner($user->householdId(), (int) $goal['ownerId']);
        $statement = $this->pdo->prepare(
            'UPDATE lh_goals SET owner_id = ?, title = ?, description = ?, start_date = ?, end_date = ?, '
            . 'status = ?, updated_at = ?, version = version + 1 WHERE household_id = ? AND id = ? '
            . 'AND version = ? AND archived_at IS NULL'
        );
        $now = gmdate('Y-m-d H:i:s');
        $statement->execute([
            $goal['ownerId'], $goal['title'], $goal['description'], $goal['startDate'], $goal['endDate'],
            $goal['status'], $now, $user->householdId(), $id, $version,
        ]);
        $this->assertChanged($statement);
        $this->replaceTrackers($user->householdId(), $id, $trackers, $now);
    }

    /** @return list<string> */
    public function delete(UserContext $user, int $id, int $version): array
    {
        $current = $this->pdo->prepare(
            'SELECT version FROM lh_goals WHERE household_id = ? AND id = ? AND archived_at IS NULL LIMIT 1'
        );
        $current->execute([$user->householdId(), $id]);
        $currentVersion = $current->fetchColumn();
        if ($currentVersion === false) {
            throw new ApiException(404, 'goal.not_found', 'Goal not found.');
        }
        if ((int) $currentVersion !== $version) {
            throw new ApiException(409, 'version.conflict', 'The goal changed; reload and retry.');
        }
        $keysStatement = $this->pdo->prepare(
            "SELECT storage_key FROM lh_attachments WHERE household_id = ? AND owner_type = 'goal' AND owner_id = ?"
        );
        $keysStatement->execute([$user->householdId(), $id]);
        $keys = $keysStatement->fetchAll(PDO::FETCH_COLUMN);
        $trackerIds = $this->trackerIds($user->householdId(), $id);
        if ($trackerIds !== []) {
            $placeholders = implode(', ', array_fill(0, count($trackerIds), '?'));
            $logs = $this->pdo->prepare(
                'DELETE FROM lh_goal_logs WHERE household_id = ? AND tracker_id IN (' . $placeholders . ')'
            );
            $logs->execute(array_merge([$user->householdId()], $trackerIds));
        }
        $trackers = $this->pdo->prepare('DELETE FROM lh_trackers WHERE household_id = ? AND goal_id = ?');
        $trackers->execute([$user->householdId(), $id]);
        $attachments = $this->pdo->prepare(
            "DELETE FROM lh_attachments WHERE household_id = ? AND owner_type = 'goal' AND owner_id = ?"
        );
        $attachments->execute([$user->householdId(), $id]);
        $goal = $this->pdo->prepare(
            'DELETE FROM lh_goals WHERE household_id = ? AND id = ? AND version = ?'
        );
        $goal->execute([$user->householdId(), $id, $version]);
        $this->assertChanged($goal);
        return array_values(array_map('strval', $keys));
    }

    /** @param bool|int|float|string $value */
    public function saveLog(UserContext $user, int $trackerId, string $date, $value, string $note): void
    {
        $tracker = $this->trackerForLog($user->householdId(), $trackerId);
        if (!Authorization::canManageHousehold($user) && (int) $tracker['owner_id'] !== $user->id()) {
            throw new ApiException(403, 'authorization.denied', 'This tracker belongs to another user.');
        }
        $type = (string) $tracker['tracker_type'];
        $number = null;
        $boolean = null;
        if ($type === 'boolean') {
            if (is_bool($value)) {
                $boolean = $value ? 1 : 0;
            } elseif (in_array((string) $value, ['0', '1'], true)) {
                $boolean = (int) $value;
            } else {
                throw new ApiException(422, 'goal.boolean_invalid', 'Boolean progress must be true or false.');
            }
        } else {
            if (!is_numeric($value)) {
                throw new ApiException(422, 'goal.number_invalid', 'Progress must be numeric.');
            }
            $number = (float) $value;
            if ($type === 'percentage' && ($number < 0 || $number > 100)) {
                throw new ApiException(422, 'goal.percentage_invalid', 'Percentage must be between 0 and 100.');
            }
        }
        $now = gmdate('Y-m-d H:i:s');
        $statement = $this->pdo->prepare(
            'INSERT INTO lh_goal_logs (household_id, tracker_id, log_date, value_number, value_boolean, note, '
            . 'created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) '
            . 'ON DUPLICATE KEY UPDATE value_number = VALUES(value_number), value_boolean = VALUES(value_boolean), '
            . 'note = VALUES(note), created_by = VALUES(created_by), updated_at = VALUES(updated_at), '
            . 'archived_at = NULL, version = version + 1'
        );
        $statement->execute([
            $user->householdId(), $trackerId, $date, $number, $boolean, $note,
            $user->id(), $now, $now,
        ]);
    }

    /** @return list<array<string, mixed>> */
    private function trackers(int $householdId, int $goalId): array
    {
        $trackers = $this->rows(
            'SELECT id, goal_id, tracker_type, target_value, unit_code, frequency_code, version '
            . 'FROM lh_trackers WHERE household_id = ? AND goal_id = ? AND archived_at IS NULL ORDER BY id',
            [$householdId, $goalId]
        );
        foreach ($trackers as &$tracker) {
            $tracker['logs'] = $this->rows(
                'SELECT id, tracker_id, log_date, value_number, value_boolean, note, version '
                . 'FROM lh_goal_logs WHERE household_id = ? AND tracker_id = ? AND archived_at IS NULL '
                . 'ORDER BY log_date DESC, id DESC LIMIT 30',
                [$householdId, (int) $tracker['id']]
            );
        }
        unset($tracker);
        return $trackers;
    }

    /** @param list<array<string, mixed>> $trackers */
    private function replaceTrackers(int $householdId, int $goalId, array $trackers, string $now): void
    {
        $existing = $this->trackerIds($householdId, $goalId);
        $kept = [];
        $update = $this->pdo->prepare(
            'UPDATE lh_trackers SET tracker_type = ?, target_value = NULL, unit_code = ?, frequency_code = ?, '
            . 'version = version + 1 WHERE household_id = ? AND goal_id = ? AND id = ?'
        );
        $insert = $this->pdo->prepare(
            'INSERT INTO lh_trackers (household_id, goal_id, tracker_type, target_value, unit_code, '
            . 'frequency_code, created_at) VALUES (?, ?, ?, NULL, ?, ?, ?)'
        );
        foreach ($trackers as $tracker) {
            $type = (string) $tracker['type'];
            $unit = $type === 'percentage' ? 'percent' : null;
            $id = $tracker['id'];
            if ($id !== null) {
                if (!in_array((int) $id, $existing, true)) {
                    throw new ApiException(422, 'goal.tracker_not_found', 'A tracker no longer belongs to this goal.');
                }
                $update->execute([$type, $unit, $tracker['frequency'], $householdId, $goalId, $id]);
                $kept[] = (int) $id;
            } else {
                $insert->execute([$householdId, $goalId, $type, $unit, $tracker['frequency'], $now]);
                $kept[] = (int) $this->pdo->lastInsertId();
            }
        }
        $removed = array_values(array_diff($existing, $kept));
        if ($removed === []) {
            return;
        }
        $placeholders = implode(', ', array_fill(0, count($removed), '?'));
        $logs = $this->pdo->prepare(
            'DELETE FROM lh_goal_logs WHERE household_id = ? AND tracker_id IN (' . $placeholders . ')'
        );
        $logs->execute(array_merge([$householdId], $removed));
        $delete = $this->pdo->prepare(
            'DELETE FROM lh_trackers WHERE household_id = ? AND goal_id = ? AND id IN (' . $placeholders . ')'
        );
        $delete->execute(array_merge([$householdId, $goalId], $removed));
    }

    private function assertOwner(int $householdId, int $ownerId): void
    {
        $statement = $this->pdo->prepare(
            "SELECT COUNT(*) FROM lh_users WHERE household_id = ? AND id = ? AND status = 'active' "
            . 'AND archived_at IS NULL'
        );
        $statement->execute([$householdId, $ownerId]);
        if ((int) $statement->fetchColumn() !== 1) {
            throw new ApiException(422, 'goal.owner_invalid', 'Goal owner is unavailable.');
        }
    }

    /** @return array<string, mixed> */
    private function trackerForLog(int $householdId, int $trackerId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT t.id, t.tracker_type, g.owner_id FROM lh_trackers t INNER JOIN lh_goals g '
            . 'ON g.household_id = t.household_id AND g.id = t.goal_id '
            . 'WHERE t.household_id = ? AND t.id = ? AND t.archived_at IS NULL '
            . 'AND g.archived_at IS NULL LIMIT 1'
        );
        $statement->execute([$householdId, $trackerId]);
        $row = $statement->fetch();
        if (!is_array($row)) {
            throw new ApiException(404, 'goal.tracker_not_found', 'Tracker not found.');
        }
        return $row;
    }

    /** @return list<int> */
    private function trackerIds(int $householdId, int $goalId): array
    {
        $statement = $this->pdo->prepare('SELECT id FROM lh_trackers WHERE household_id = ? AND goal_id = ?');
        $statement->execute([$householdId, $goalId]);
        $ids = $statement->fetchAll(PDO::FETCH_COLUMN);
        return array_map('intval', $ids);
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
            throw new ApiException(409, 'version.conflict', 'The goal changed; reload and retry.');
        }
    }
}
