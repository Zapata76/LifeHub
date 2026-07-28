<?php

/** Reads the active household members available for task assignment and filtering. */

declare(strict_types=1);

namespace LifeHub\Tasks;

use LifeHub\Shared\Auth\Authorization;
use LifeHub\Shared\Auth\UserContext;
use PDO;

final class TaskMemberRepository
{
    /** @var PDO */ private $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /** @return list<array{id:int, username:string}> */
    public function list(UserContext $user): array
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
        return is_array($rows) ? $rows : [];
    }
}
