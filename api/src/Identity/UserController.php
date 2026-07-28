<?php

/**
 * Provides administrator-only household user lifecycle operations.
 */

declare(strict_types=1);

namespace LifeHub\Identity;

use LifeHub\Shared\Audit\AuditLogger;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Http\JsonResponder;
use LifeHub\Shared\Http\RequestData;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class UserController
{
    /** @var UserRepository */
    private $users;
    /** @var AuditLogger */
    private $audit;

    public function __construct(UserRepository $users, AuditLogger $audit)
    {
        $this->users = $users;
        $this->audit = $audit;
    }

    public function index(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $this->admin($request);
        return JsonResponder::write($response, [
            'items' => $this->users->list($user->householdId()),
            'calendarAssignments' => $this->users->calendarAssignments($user->householdId()),
        ]);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $this->admin($request);
        $data = new RequestData($request);
        $role = $this->role($data->requiredString('role', 16));
        $password = $data->requiredString('password', 1024);
        if (mb_strlen($password, 'UTF-8') < 12) {
            throw new ApiException(422, 'user.password_short', 'Password must contain at least 12 characters.');
        }
        $username = $data->requiredString('username', 50);
        if (preg_match('/^[A-Za-z0-9._-]{3,50}$/', $username) !== 1) {
            throw new ApiException(
                422,
                'user.invalid_username',
                'Username must contain 3-50 letters, numbers, dots, underscores, or hyphens.'
            );
        }
        $id = $this->users->create(
            $user->householdId(),
            $username,
            $password,
            $role
        );
        $this->record($request, $user, 'user.created', $id);

        return JsonResponder::write($response, ['id' => $id], 201);
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->admin($request);
        $data = new RequestData($request);
        $status = $data->requiredString('status', 16);
        if (!in_array($status, ['active', 'disabled'], true)) {
            throw new ApiException(422, 'user.invalid_status', 'Unsupported user status.');
        }
        $targetId = (int) $args['id'];
        $role = $this->role($data->requiredString('role', 16));
        if ($targetId === $user->id() && ($role !== 'admin' || $status !== 'active')) {
            throw new ApiException(409, 'user.self_lockout', 'You cannot demote or disable your own account.');
        }
        $updated = $this->users->update(
            $user->householdId(),
            $targetId,
            $role,
            $status,
            $data->requiredInt('version')
        );
        if (!$updated) {
            throw new ApiException(409, 'version.conflict', 'The user was modified by another request.');
        }
        $this->record($request, $user, 'user.updated', $targetId);

        return JsonResponder::write($response, ['updated' => true]);
    }

    /** @param array<string, string> $args */
    public function resetPassword(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        $user = $this->admin($request);
        $data = new RequestData($request);
        $password = $data->requiredString('password', 1024);
        if (mb_strlen($password, 'UTF-8') < 12) {
            throw new ApiException(422, 'user.password_short', 'Password must contain at least 12 characters.');
        }
        $targetId = (int) $args['id'];
        if (
            !$this->users->resetPassword(
                $user->householdId(),
                $targetId,
                $password,
                $data->requiredInt('version')
            )
        ) {
            throw new ApiException(409, 'version.conflict', 'The user was modified by another request.');
        }
        $this->record($request, $user, 'user.password_reset', $targetId);
        return JsonResponder::write($response, ['updated' => true]);
    }

    /** @param array<string, string> $args */
    public function assignCalendar(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        return $this->calendarAssignment($request, $response, $args, true);
    }

    /** @param array<string, string> $args */
    public function unassignCalendar(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        return $this->calendarAssignment($request, $response, $args, false);
    }

    private function admin(ServerRequestInterface $request): UserContext
    {
        $user = $request->getAttribute(UserContext::class);
        if (!$user instanceof UserContext || $user->role() !== 'admin') {
            throw new ApiException(403, 'authorization.denied', 'Administrator access is required.');
        }

        return $user;
    }

    private function role(string $role): string
    {
        if (!in_array($role, ['admin', 'adult', 'child'], true)) {
            throw new ApiException(422, 'user.invalid_role', 'Unsupported user role.');
        }

        return $role;
    }

    /** @param array<string, string> $args */
    private function calendarAssignment(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
        bool $assigned
    ): ResponseInterface {
        $user = $this->admin($request);
        $targetId = (int) $args['id'];
        $calendarId = (int) $args['calendarId'];
        $changed = $this->users->setCalendarAssignment(
            $user->householdId(),
            $targetId,
            $calendarId,
            $user->id(),
            $assigned
        );
        if ($changed) {
            $this->record(
                $request,
                $user,
                $assigned ? 'user.calendar_assigned' : 'user.calendar_unassigned',
                $targetId
            );
        }
        return JsonResponder::write($response, ['changed' => $changed]);
    }

    private function record(
        ServerRequestInterface $request,
        UserContext $user,
        string $event,
        int $id
    ): void {
        $this->audit->record(
            $user,
            $event,
            'user',
            $id,
            (string) $request->getAttribute('correlationId', 'unavailable')
        );
    }
}
