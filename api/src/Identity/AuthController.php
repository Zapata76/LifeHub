<?php

/**
 * Exposes session bootstrap, login, and logout without trusting client role claims.
 */

declare(strict_types=1);

namespace LifeHub\Identity;

use LifeHub\Shared\Http\JsonResponder;
use LifeHub\Push\PushSubscriptionRepository;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\RequestData;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use RuntimeException;

final class AuthController
{
    /** @var AuthService */
    private $service;
    /** @var UserRepository */
    private $users;

    public function __construct(AuthService $service, UserRepository $users, private PushSubscriptionRepository $push)
    {
        $this->service = $service;
        $this->users = $users;
    }

    public function session(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = isset($_SESSION['user']) && is_array($_SESSION['user']) ? $_SESSION['user'] : null;
        if ($user !== null && !isset($user['id'], $user['householdId'], $user['sessionVersion'])) {
            unset($_SESSION['user']);
            $user = null;
        }
        if ($user !== null) {
            $current = $this->users->findActive((int) $user['householdId'], (int) $user['id']);
            if ($current === null || (int) $current['session_version'] !== (int) $user['sessionVersion']) {
                unset($_SESSION['user']);
                $user = null;
            } else {
                $user = [
                    'id' => (int) $current['id'],
                    'householdId' => (int) $current['household_id'],
                    'role' => (string) $current['role'],
                    'username' => (string) $current['username'],
                    'sessionVersion' => (int) $current['session_version'],
                ];
                $_SESSION['user'] = $user;
            }
        }

        return JsonResponder::write($response, [
            'authenticated' => $user !== null,
            'user' => $user === null ? null : $this->publicUser($user),
            'csrfToken' => (string) ($_SESSION['csrfToken'] ?? ''),
        ]);
    }

    public function login(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = new RequestData($request);
        $user = $this->service->login(
            $data->requiredString('username', 190),
            $data->requiredString('password', 1024),
            $request->getServerParams()['REMOTE_ADDR'] ?? 'unknown'
        );
        $this->regenerateSessionId();
        $_SESSION['user'] = $user;
        $_SESSION['csrfToken'] = bin2hex(random_bytes(32));

        return JsonResponder::write($response, [
            'authenticated' => true,
            'user' => $this->publicUser($user),
            'csrfToken' => $_SESSION['csrfToken'],
        ]);
    }

    public function logout(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $_SESSION['user'] ?? null;
        $endpoint = (new RequestData($request))->optionalString('pushEndpoint', 2048);
        if (is_array($user) && isset($user['id'], $user['householdId']) && $endpoint !== null) {
            $this->push->remove(new UserContext((int) $user['id'], (int) $user['householdId'], '', ''), $endpoint);
        }
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) {
            $this->regenerateSessionId();
        }

        return JsonResponder::write($response, ['authenticated' => false]);
    }

    private function regenerateSessionId(): void
    {
        if (headers_sent()) {
            if (PHP_SAPI !== 'cli') {
                throw new RuntimeException('Cannot rotate the session identifier after output.');
            }
            return;
        }
        session_regenerate_id(true);
    }

    /**
     * @param array<string, mixed> $user
     * @return array{id:int, householdId:int, role:string, username:string}
     */
    private function publicUser(array $user): array
    {
        return [
            'id' => (int) $user['id'],
            'householdId' => (int) $user['householdId'],
            'role' => (string) $user['role'],
            'username' => (string) $user['username'],
        ];
    }
}
