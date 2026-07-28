<?php

declare(strict_types=1);

namespace LifeHub\Tests\Unit;

use LifeHub\Shared\Config\Settings;
use PHPUnit\Framework\TestCase;
use RuntimeException;

final class SettingsTest extends TestCase
{
    public function testLoadsApplicationValuesWithoutEnvironmentVariables(): void
    {
        $settings = Settings::fromArray([
            'environment' => 'production',
            'apiBasePath' => '/umbertini/api',
            'siteName' => 'Hub Corso Umberto',
            'dbName' => 'production_database',
            'dbUser' => 'production_user',
            'sessionName' => 'lifehub_prod',
            'sessionIdleSeconds' => 28800,
            'storagePath' => '/var/private/lifehub/uploads',
            'logPath' => '/var/private/lifehub/uploads/logs/application.log',
        ]);

        self::assertSame('production_database', $settings->get('dbName'));
        self::assertSame('28800', $settings->get('sessionIdleSeconds'));
        self::assertSame('/var/private/lifehub/uploads', $settings->get('storagePath'));
        self::assertFalse($settings->isDebug());
    }

    public function testRejectsRelativeStoragePath(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('absolute filesystem path');

        Settings::fromArray([
            'dbName' => 'production_database',
            'dbUser' => 'production_user',
            'storagePath' => 'uploads',
        ]);
    }

    public function testRejectsUneditedProductionPlaceholder(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('still contains a placeholder');

        Settings::fromArray([
            'dbName' => 'REPLACE_WITH_PRODUCTION_DATABASE',
            'dbUser' => 'production_user',
            'storagePath' => '/var/private/lifehub/uploads',
        ]);
    }
}
