<?php

/**
 * Proves the exact PHP runtime contract required by Life Hub.
 */

declare(strict_types=1);

namespace LifeHub\Tests\Quality;

use PHPUnit\Framework\TestCase;

final class PhpRuntimeTest extends TestCase
{
    public function testExactPhpRuntimeIsUsed(): void
    {
        self::assertSame('7.4.33', PHP_VERSION);
        self::assertSame('Europe/Rome', date_default_timezone_get());
    }

    /**
     * @dataProvider requiredExtensions
     */
    public function testRequiredExtensionIsLoaded(string $extension): void
    {
        self::assertTrue(extension_loaded($extension), sprintf('Missing PHP extension: %s', $extension));
    }

    /**
     * @return array<string, array{string}>
     */
    public function requiredExtensions(): array
    {
        return [
            'fileinfo' => ['fileinfo'],
            'json' => ['json'],
            'mbstring' => ['mbstring'],
            'pdo_mysql' => ['pdo_mysql'],
            'session' => ['session'],
        ];
    }

    public function testBcryptRoundTripAndRehashCheck(): void
    {
        $hash = password_hash('synthetic-test-password', PASSWORD_BCRYPT, ['cost' => 10]);

        self::assertIsString($hash);
        self::assertTrue(password_verify('synthetic-test-password', $hash));
        self::assertFalse(password_verify('wrong-password', $hash));
        self::assertFalse(password_needs_rehash($hash, PASSWORD_BCRYPT, ['cost' => 10]));
    }
}
