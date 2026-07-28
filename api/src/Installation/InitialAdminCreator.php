<?php

/**
 * Creates the first household, administrator and primary shopping list.
 */

declare(strict_types=1);

namespace LifeHub\Installation;

use DateTimeZone;
use LifeHub\Shared\Text\SearchKey;
use PDO;
use RuntimeException;
use Throwable;

final class InitialAdminCreator
{
    /** @var PDO */
    private $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * @return array{householdId:int,userId:int,shoppingListId:int}
     */
    public function create(
        string $username,
        string $password,
        string $householdName,
        string $timezone
    ): array {
        $username = trim($username);
        $householdName = trim($householdName);
        if (mb_strlen($username, 'UTF-8') < 3 || mb_strlen($username, 'UTF-8') > 50) {
            throw new RuntimeException('Administrator username must contain 3-50 characters.');
        }
        if (mb_strlen($password, 'UTF-8') < 12) {
            throw new RuntimeException('Administrator password must contain at least 12 characters.');
        }
        if ($householdName === '' || mb_strlen($householdName, 'UTF-8') > 255) {
            throw new RuntimeException('Household name must contain 1-255 characters.');
        }
        if (!in_array($timezone, DateTimeZone::listIdentifiers(), true)) {
            throw new RuntimeException('Unsupported household timezone.');
        }

        $hash = password_hash($password, PASSWORD_BCRYPT);
        if (!is_string($hash)) {
            throw new RuntimeException('Cannot hash the administrator password.');
        }

        $householdId = 0;
        $userId = 0;
        $shoppingListId = 0;
        $this->pdo->exec('LOCK TABLES lh_households WRITE, lh_users WRITE, lh_shopping_lists WRITE');
        try {
            $householdCount = $this->pdo->query('SELECT COUNT(*) FROM lh_households');
            $userCount = $this->pdo->query('SELECT COUNT(*) FROM lh_users');
            if ($householdCount === false || $userCount === false) {
                throw new RuntimeException('Cannot inspect the installation state.');
            }
            $households = (int) $householdCount->fetchColumn();
            $users = (int) $userCount->fetchColumn();
            if ($households !== 0 || $users !== 0) {
                throw new RuntimeException('Initial administrator creation requires an empty installation.');
            }

            $now = gmdate('Y-m-d H:i:s');
            $household = $this->pdo->prepare(
                'INSERT INTO lh_households (name, timezone, created_at, updated_at) VALUES (?, ?, ?, ?)'
            );
            $household->execute([$householdName, $timezone, $now, $now]);
            $householdId = (int) $this->pdo->lastInsertId();

            $user = $this->pdo->prepare(
                'INSERT INTO lh_users '
                . '(household_id, username, username_key, password_hash, role, status, created_at, updated_at) '
                . "VALUES (?, ?, ?, ?, 'admin', 'active', ?, ?)"
            );
            $user->execute([$householdId, $username, SearchKey::from($username), $hash, $now, $now]);
            $userId = (int) $this->pdo->lastInsertId();

            $shoppingList = $this->pdo->prepare(
                'INSERT INTO lh_shopping_lists '
                . '(household_id, name, name_key, is_primary, created_by, created_at) '
                . 'VALUES (?, ?, ?, 1, ?, ?)'
            );
            $listName = 'Lista della spesa';
            $shoppingList->execute([
                $householdId,
                $listName,
                SearchKey::from($listName),
                $userId,
                $now,
            ]);
            $shoppingListId = (int) $this->pdo->lastInsertId();
        } catch (Throwable $exception) {
            if ($userId !== 0) {
                $this->pdo->exec('DELETE FROM lh_users WHERE id = ' . $userId);
            }
            if ($householdId !== 0) {
                $this->pdo->exec('DELETE FROM lh_households WHERE id = ' . $householdId);
            }
            throw $exception;
        } finally {
            $this->pdo->exec('UNLOCK TABLES');
        }

        return [
            'householdId' => $householdId,
            'userId' => $userId,
            'shoppingListId' => $shoppingListId,
        ];
    }
}
