<?php

/**
 * Carries the authenticated user identity trusted by backend policies.
 */

declare(strict_types=1);

namespace LifeHub\Shared\Auth;

final class UserContext
{
    /** @var int */
    private $id;
    /** @var int */
    private $householdId;
    /** @var string */
    private $role;
    /** @var string */
    private $username;

    public function __construct(int $id, int $householdId, string $role, string $username)
    {
        $this->id = $id;
        $this->householdId = $householdId;
        $this->role = $role;
        $this->username = $username;
    }

    public function id(): int
    {
        return $this->id;
    }

    public function householdId(): int
    {
        return $this->householdId;
    }

    public function role(): string
    {
        return $this->role;
    }

    public function username(): string
    {
        return $this->username;
    }

    /**
     * @return array{id:int, householdId:int, role:string, username:string}
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'householdId' => $this->householdId,
            'role' => $this->role,
            'username' => $this->username,
        ];
    }
}
