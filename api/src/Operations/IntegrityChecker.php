<?php

/**
 * Produces aggregate reconciliation evidence without exposing household content or PII.
 */

declare(strict_types=1);

namespace LifeHub\Operations;

use PDO;
use RuntimeException;

final class IntegrityChecker
{
    /** @var PDO */ private $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /** @return array<string, mixed> */
    public function report(): array
    {
        $tables = [
            'lh_users', 'lh_calendars', 'lh_user_calendars', 'lh_tasks',
            'lh_task_notification_deliveries', 'lh_push_subscriptions', 'lh_notes',
            'lh_categories', 'lh_supermarkets', 'lh_products', 'lh_prices', 'lh_recipes',
            'lh_recipe_ingredients', 'lh_meal_plan', 'lh_meal_plan_recipes', 'lh_shopping_lists',
            'lh_shopping_items', 'lh_documents', 'lh_inventory_categories', 'lh_inventory',
            'lh_goals', 'lh_trackers',
            'lh_goal_logs', 'lh_attachments',
        ];
        $counts = [];
        foreach ($tables as $table) {
            $counts[$table] = $this->scalar('SELECT COUNT(*) FROM ' . $table);
        }
        $orphans = [
            'push_subscriptions.user_id' => $this->orphan('lh_push_subscriptions', 'user_id', 'lh_users', 'id'),
            'tasks.assigned_to' => $this->orphan(
                'lh_tasks',
                'assigned_to',
                'lh_users',
                'id',
                'assigned_to IS NOT NULL'
            ),
            'task_notifications.user_id' => $this->orphan(
                'lh_task_notification_deliveries',
                'user_id',
                'lh_users',
                'id'
            ),
            'products.category_id' => $this->orphan(
                'lh_products',
                'category_id',
                'lh_categories',
                'id',
                'category_id IS NOT NULL'
            ),
            'inventory.category_id' => $this->orphan(
                'lh_inventory',
                'category_id',
                'lh_inventory_categories',
                'id'
            ),
            'prices.product_id' => $this->orphan('lh_prices', 'product_id', 'lh_products', 'id'),
            'prices.supermarket_id' => $this->orphan(
                'lh_prices',
                'supermarket_id',
                'lh_supermarkets',
                'id'
            ),
            'ingredients.recipe_id' => $this->orphan(
                'lh_recipe_ingredients',
                'recipe_id',
                'lh_recipes',
                'id'
            ),
            'meal_recipes.meal_id' => $this->orphan(
                'lh_meal_plan_recipes',
                'meal_plan_id',
                'lh_meal_plan',
                'id'
            ),
            'meal_recipes.recipe_id' => $this->orphan(
                'lh_meal_plan_recipes',
                'recipe_id',
                'lh_recipes',
                'id'
            ),
            'trackers.goal_id' => $this->orphan('lh_trackers', 'goal_id', 'lh_goals', 'id'),
            'goal_logs.tracker_id' => $this->orphan('lh_goal_logs', 'tracker_id', 'lh_trackers', 'id'),
        ];
        $engineMismatches = $this->scalar(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() "
            . "AND LEFT(table_name, 3) = 'lh_' AND engine <> 'MyISAM'"
        );
        return [
            'generatedAt' => gmdate('c'),
            'counts' => $counts,
            'orphans' => $orphans,
            'orphanTotal' => array_sum($orphans),
            'nonMyisamTableCount' => $engineMismatches,
            'status' => array_sum($orphans) === 0 && $engineMismatches === 0
                ? 'PASS'
                : 'FAIL',
        ];
    }

    private function orphan(
        string $sourceTable,
        string $sourceColumn,
        string $targetTable,
        string $targetColumn,
        string $extra = '1 = 1'
    ): int {
        $sql = 'SELECT COUNT(*) FROM ' . $sourceTable . ' source '
            . 'LEFT JOIN ' . $targetTable . ' target ON target.household_id = source.household_id '
            . 'AND target.' . $targetColumn . ' = source.' . $sourceColumn . ' '
            . 'WHERE ' . $extra . ' AND target.' . $targetColumn . ' IS NULL';
        return $this->scalar($sql);
    }

    private function scalar(string $sql): int
    {
        $statement = $this->pdo->query($sql);
        if ($statement === false) {
            throw new RuntimeException('Integrity query failed.');
        }
        return (int) $statement->fetchColumn();
    }
}
