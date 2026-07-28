<?php

/**
 * Authenticates users, rate-limits failures, and refreshes bcrypt hashes when needed.
 */

declare(strict_types=1);

namespace LifeHub\Identity;

use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Text\SearchKey;
use PDO;

final class AuthService
{
    private const MAX_FAILURES = 5;

    /** @var PDO */
    private $pdo;
    /** @var UserRepository */
    private $users;

    public function __construct(PDO $pdo, UserRepository $users)
    {
        $this->pdo = $pdo;
        $this->users = $users;
    }

    /** @return array{id:int, householdId:int, role:string, username:string, sessionVersion:int} */
    public function login(string $username, string $password, string $ipAddress): array
    {
        $usernameKey = SearchKey::from($username);
        $ipHash = hash('sha256', $ipAddress);
        if ($this->recentFailures($usernameKey, $ipHash) >= self::MAX_FAILURES) {
            throw new ApiException(429, 'auth.rate_limited', 'Too many login attempts. Try again later.');
        }

        $row = $this->users->findForLogin($username);
        if ($row === null) {
            $this->recordAttempt($usernameKey, $ipHash, false);
            throw new ApiException(401, 'auth.invalid_credentials', 'Invalid username or password.');
        }
        $valid = $this->verifyPassword($row, $password);
        $this->recordAttempt($usernameKey, $ipHash, $valid);
        if (!$valid) {
            throw new ApiException(401, 'auth.invalid_credentials', 'Invalid username or password.');
        }

        $sessionVersion = (int) $row['session_version'];
        if (password_needs_rehash((string) $row['password_hash'], PASSWORD_BCRYPT)) {
            $sessionVersion = $this->users->updatePassword(
                (int) $row['id'],
                password_hash($password, PASSWORD_BCRYPT)
            );
        }

        return [
            'id' => (int) $row['id'],
            'householdId' => (int) $row['household_id'],
            'role' => (string) $row['role'],
            'username' => (string) $row['username'],
            'sessionVersion' => $sessionVersion,
        ];
    }

    /** @param array<string, mixed> $row */
    private function verifyPassword(array $row, string $password): bool
    {
        if (isset($row['password_hash']) && is_string($row['password_hash']) && $row['password_hash'] !== '') {
            return password_verify($password, $row['password_hash']);
        }
        return false;
    }

    private function recentFailures(string $usernameKey, string $ipHash): int
    {
        $window = gmdate('Y-m-d H:i:s', time() - 900);
        $statement = $this->pdo->prepare(
            'SELECT COUNT(*) FROM lh_login_attempts '
            . 'WHERE username_key = ? AND ip_hash = ? AND succeeded = 0 AND attempted_at >= ?'
        );
        $statement->execute([$usernameKey, $ipHash, $window]);

        return (int) $statement->fetchColumn();
    }

    private function recordAttempt(string $usernameKey, string $ipHash, bool $succeeded): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO lh_login_attempts (username_key, ip_hash, attempted_at, succeeded) VALUES (?, ?, ?, ?)'
        );
        $statement->execute([$usernameKey, $ipHash, gmdate('Y-m-d H:i:s'), $succeeded ? 1 : 0]);
    }
}
