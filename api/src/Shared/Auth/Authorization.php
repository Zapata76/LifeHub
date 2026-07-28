<?php

/**
 * Centralizes the first-release role and object-level authorization rules.
 */

declare(strict_types=1);

namespace LifeHub\Shared\Auth;

final class Authorization
{
    public static function canManageHousehold(UserContext $user): bool
    {
        return in_array($user->role(), ['admin', 'adult'], true);
    }

    /**
     * @param array<string, mixed> $task
     */
    public static function canReadTask(UserContext $user, array $task): bool
    {
        if ((int) $task['household_id'] !== $user->householdId()) {
            return false;
        }

        if (self::canManageHousehold($user)) {
            return true;
        }

        return (int) $task['created_by'] === $user->id()
            || (int) $task['assigned_to'] === $user->id();
    }
}
