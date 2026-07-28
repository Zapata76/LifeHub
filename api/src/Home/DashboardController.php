<?php

/**
 * Builds a small role-aware home read model without exposing sensitive record content.
 */

declare(strict_types=1);

namespace LifeHub\Home;

use LifeHub\Shared\Auth\Authorization;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Http\JsonResponder;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class DashboardController
{
    /** @var PDO */ private $pdo;
    /** @var HomeSettingsRepository */ private $settings;

    public function __construct(PDO $pdo, HomeSettingsRepository $settings)
    {
        $this->pdo = $pdo;
        $this->settings = $settings;
    }

    public function show(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $request->getAttribute(UserContext::class);
        if (!$user instanceof UserContext) {
            throw new ApiException(401, 'auth.required', 'Authentication is required.');
        }
        $taskSql = "SELECT COUNT(*) FROM lh_tasks WHERE household_id = ? AND archived_at IS NULL "
            . "AND status <> 'completed'";
        $taskValues = [$user->householdId()];
        if (!Authorization::canManageHousehold($user)) {
            $taskSql .= ' AND (created_by = ? OR assigned_to = ?)';
            $taskValues[] = $user->id();
            $taskValues[] = $user->id();
        }
        $shopping = Authorization::canManageHousehold($user)
            ? $this->count(
                'SELECT COUNT(*) FROM lh_shopping_items WHERE household_id = ? '
                . 'AND archived_at IS NULL AND checked = 0',
                [$user->householdId()]
            )
            : null;
        return JsonResponder::write($response, array_merge($this->settings->read($user->householdId()), [
            'openTasks' => $this->count($taskSql, $taskValues),
            'uncheckedShoppingItems' => $shopping,
            'upcomingMeals' => $this->count(
                'SELECT COUNT(*) FROM lh_meal_plan WHERE household_id = ? AND archived_at IS NULL '
                . 'AND meal_date BETWEEN ? AND ?',
                [$user->householdId(), date('Y-m-d'), date('Y-m-d', strtotime('+7 days'))]
            ),
            'activeGoals' => $this->count(
                "SELECT COUNT(*) FROM lh_goals WHERE household_id = ? AND owner_id = ? "
                . "AND archived_at IS NULL AND status = 'active'",
                [$user->householdId(), $user->id()]
            ),
        ]));
    }

    /** @param list<int|string> $values */
    private function count(string $sql, array $values): int
    {
        $statement = $this->pdo->prepare($sql);
        $statement->execute($values);
        return (int) $statement->fetchColumn();
    }
}
