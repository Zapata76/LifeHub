<?php

/**
 * Covers positive and negative task authorization for all household roles.
 */

declare(strict_types=1);

namespace LifeHub\Tests\Unit;

use LifeHub\Shared\Auth\Authorization;
use LifeHub\Shared\Auth\UserContext;
use PHPUnit\Framework\TestCase;

final class AuthorizationTest extends TestCase
{
    /** @dataProvider roleProvider */
    public function testAdultsManageHousehold(string $role, bool $expected): void
    {
        self::assertSame($expected, Authorization::canManageHousehold(new UserContext(1, 10, $role, $role)));
    }

    /** @return list<array{string, bool}> */
    public function roleProvider(): array
    {
        return [['admin', true], ['adult', true], ['child', false]];
    }

    public function testChildOnlyReadsOwnOrAssignedTaskWithinHousehold(): void
    {
        $child = new UserContext(3, 10, 'child', 'child');
        self::assertTrue(Authorization::canReadTask($child, $this->task(10, 3, 2)));
        self::assertTrue(Authorization::canReadTask($child, $this->task(10, 2, 3)));
        self::assertFalse(Authorization::canReadTask($child, $this->task(10, 1, 2)));
        self::assertFalse(Authorization::canReadTask($child, $this->task(11, 3, 3)));
    }

    /** @return array<string, int> */
    private function task(int $householdId, int $createdBy, int $assignedTo): array
    {
        return ['household_id' => $householdId, 'created_by' => $createdBy, 'assigned_to' => $assignedTo];
    }
}
