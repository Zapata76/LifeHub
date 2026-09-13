<?php

declare(strict_types=1);

namespace LifeHub\Tasks\Notifications;

use PDO;

final class TaskNotificationRepository
{
    /** @var PDO */ private $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /** @return list<array<string, mixed>> */
    public function pendingAssignments(): array
    {
        $statement = $this->pdo->query(
            "SELECT u.id AS user_id, u.household_id, u.username, u.email, "
            . "h.name AS household_name, h.timezone, t.id AS task_id, t.title, t.status, "
            . "t.priority, t.due_date FROM lh_users u "
            . "INNER JOIN lh_households h ON h.id = u.household_id "
            . "INNER JOIN lh_tasks t ON t.household_id = u.household_id AND t.assigned_to = u.id "
            . "WHERE u.status = 'active' AND u.archived_at IS NULL "
            . "AND u.email IS NOT NULL AND u.email <> '' AND t.archived_at IS NULL "
            . "AND t.status IN ('open', 'in_progress') "
            . "ORDER BY u.household_id, u.id, t.due_date IS NULL, t.due_date, t.id"
        );
        return $statement === false ? [] : $statement->fetchAll();
    }

    /** @return list<array<string, mixed>> */
    public function plannedMeals(int $householdId, string $start, string $end): array
    {
        $statement = $this->pdo->prepare(
            'SELECT m.id, m.meal_date, m.meal_type, m.description, r.title AS recipe_title '
            . 'FROM lh_meal_plan m LEFT JOIN lh_meal_plan_recipes link '
            . 'ON link.household_id = m.household_id AND link.meal_plan_id = m.id '
            . 'AND link.archived_at IS NULL LEFT JOIN lh_recipes r '
            . 'ON r.household_id = link.household_id AND r.id = link.recipe_id AND r.archived_at IS NULL '
            . 'WHERE m.household_id = ? AND m.meal_date BETWEEN ? AND ? AND m.archived_at IS NULL '
            . "ORDER BY m.meal_date, FIELD(m.meal_type, 'breakfast', 'lunch', 'dinner'), m.id, "
            . 'link.position_no, link.id'
        );
        $statement->execute([$householdId, $start, $end]);
        $meals = [];
        foreach ($statement->fetchAll() as $row) {
            $id = (int) $row['id'];
            if (!isset($meals[$id])) {
                $meals[$id] = [
                    'meal_date' => $row['meal_date'],
                    'meal_type' => $row['meal_type'],
                    'description' => $row['description'],
                    'recipes' => [],
                ];
            }
            if ($row['recipe_title'] !== null) {
                $meals[$id]['recipes'][] = (string) $row['recipe_title'];
            }
        }
        return array_values($meals);
    }

    public function claim(int $householdId, int $userId, string $date, string $now): ?int
    {
        $this->pdo->exec('LOCK TABLES lh_task_notification_deliveries WRITE');
        try {
            $statement = $this->pdo->prepare(
                'SELECT id, status, claimed_at FROM lh_task_notification_deliveries '
                . 'WHERE household_id = ? AND user_id = ? AND notification_date = ? LIMIT 1'
            );
            $statement->execute([$householdId, $userId, $date]);
            $delivery = $statement->fetch();
            if (is_array($delivery)) {
                if ((string) $delivery['status'] === 'sent') {
                    return null;
                }
                $staleBefore = gmdate('Y-m-d H:i:s', strtotime($now . ' UTC') - 1800);
                if (
                    (string) $delivery['status'] === 'sending'
                    && (string) $delivery['claimed_at'] >= $staleBefore
                ) {
                    return null;
                }
                $update = $this->pdo->prepare(
                    "UPDATE lh_task_notification_deliveries SET status = 'sending', "
                    . 'attempt_count = attempt_count + 1, claimed_at = ?, last_error_code = NULL, updated_at = ? '
                    . 'WHERE id = ?'
                );
                $update->execute([$now, $now, (int) $delivery['id']]);
                return (int) $delivery['id'];
            }

            $insert = $this->pdo->prepare(
                'INSERT INTO lh_task_notification_deliveries '
                . '(household_id, user_id, notification_date, status, claimed_at, created_at, updated_at) '
                . "VALUES (?, ?, ?, 'sending', ?, ?, ?)"
            );
            $insert->execute([$householdId, $userId, $date, $now, $now, $now]);
            return (int) $this->pdo->lastInsertId();
        } finally {
            $this->pdo->exec('UNLOCK TABLES');
        }
    }

    public function markSent(int $id, string $now): void
    {
        $statement = $this->pdo->prepare(
            "UPDATE lh_task_notification_deliveries SET status = 'sent', sent_at = ?, updated_at = ? WHERE id = ?"
        );
        $statement->execute([$now, $now, $id]);
    }

    public function markFailed(int $id, string $now): void
    {
        $statement = $this->pdo->prepare(
            "UPDATE lh_task_notification_deliveries SET status = 'failed', last_error_code = 'mail.send_failed', "
            . 'updated_at = ? WHERE id = ?'
        );
        $statement->execute([$now, $id]);
    }

    /** @return array{sentToday:int,failedToday:int,lastSentAt:?string} */
    public function deliverySummary(string $date): array
    {
        $statement = $this->pdo->prepare(
            "SELECT SUM(CASE WHEN notification_date = ? AND status = 'sent' THEN 1 ELSE 0 END) AS sent_today, "
            . "SUM(CASE WHEN notification_date = ? AND status = 'failed' THEN 1 ELSE 0 END) AS failed_today, "
            . 'MAX(sent_at) AS last_sent_at FROM lh_task_notification_deliveries'
        );
        $statement->execute([$date, $date]);
        $row = $statement->fetch();
        return [
            'sentToday' => is_array($row) ? (int) $row['sent_today'] : 0,
            'failedToday' => is_array($row) ? (int) $row['failed_today'] : 0,
            'lastSentAt' => is_array($row) && $row['last_sent_at'] !== null
                ? (string) $row['last_sent_at']
                : null,
        ];
    }
}
