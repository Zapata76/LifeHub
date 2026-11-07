<?php

declare(strict_types=1);

namespace LifeHub\Diagnostics;

use PDO;

/** Fixed SELECTs only: no caller-controlled SQL, broad scans, descriptions or attachments. */
final class ProbeWorkload
{
    /** @param array<string, float> $timings */
    public function run(PDO $pdo, int $household, array &$timings): void
    {
        $queries = [
            'tasks_read' => 'SELECT status, priority, due_date FROM lh_tasks '
                . 'WHERE household_id = ? LIMIT 100',
            'shopping_read' => 'SELECT checked, product_id FROM lh_shopping_items '
                . 'WHERE household_id = ? LIMIT 100',
            'meals_read' => 'SELECT meal_date, meal_type FROM lh_meal_plan '
                . 'WHERE household_id = ? AND meal_date >= ? AND meal_date < ? LIMIT 100',
        ];
        $rows = [];
        foreach ($queries as $phase => $sql) {
            $started = hrtime(true);
            try {
                $statement = $pdo->prepare($sql);
                $parameters = $phase === 'meals_read'
                    ? [$household, gmdate('Y-m-d'), gmdate('Y-m-d', time() + 7 * 86400)] : [$household];
                $statement->execute($parameters);
                $rows[$phase] = $statement->fetchAll(PDO::FETCH_ASSOC);
            } finally {
                $timings[$phase] = (hrtime(true) - $started) / 1000000;
            }
        }
        $started = hrtime(true);
        // Representative grouping/sorting; none of the result values leave this method.
        $groups = [];
        foreach ($rows['tasks_read'] as $task) {
            $key = (string) $task['status'] . ':' . (string) $task['priority'];
            $groups[$key] = ($groups[$key] ?? 0) + 1;
        }
        ksort($groups);
        usort($rows['tasks_read'], static fn (array $a, array $b): int =>
            strcmp((string) ($a['due_date'] ?? '9999'), (string) ($b['due_date'] ?? '9999')));
        // Exercise serialization on bounded data but discard the serialized content.
        json_encode([$groups, $rows], JSON_THROW_ON_ERROR);
        $timings['calculation'] = (hrtime(true) - $started) / 1000000;
    }
}
