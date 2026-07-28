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
            'basePath' => '/apps/family/lifehub',
            'siteName' => 'Family Hub',
            'dbName' => 'production_database',
            'dbUser' => 'production_user',
            'sessionName' => 'lifehub_prod',
            'sessionIdleSeconds' => 28800,
            'storagePath' => '/var/private/lifehub/uploads',
        ]);

        self::assertSame('production_database', $settings->get('dbName'));
        self::assertSame('28800', $settings->get('sessionIdleSeconds'));
        self::assertSame('/var/private/lifehub/uploads', $settings->get('storagePath'));
        self::assertSame('/apps/family/lifehub/api', $settings->apiPath());
        self::assertSame('/apps/family/lifehub/', $settings->webPath());
        self::assertFalse($settings->isDebug());
    }

    public function testUsesTheDomainRootByDefault(): void
    {
        $settings = Settings::fromArray([
            'dbName' => 'production_database',
            'dbUser' => 'production_user',
            'storagePath' => '/var/private/lifehub/uploads',
        ]);

        self::assertSame('', $settings->get('basePath'));
        self::assertSame('/api', $settings->apiPath());
        self::assertSame('/', $settings->webPath());
    }

    /**
     * @dataProvider invalidBasePaths
     */
    public function testRejectsInvalidBasePath(string $basePath): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Base path must be empty');

        Settings::fromArray([
            'basePath' => $basePath,
            'dbName' => 'production_database',
            'dbUser' => 'production_user',
            'storagePath' => '/var/private/lifehub/uploads',
        ]);
    }

    /** @return array<string, array{string}> */
    public function invalidBasePaths(): array
    {
        return [
            'relative' => ['apps/lifehub'],
            'trailing slash' => ['/apps/lifehub/'],
            'empty segment' => ['/apps//lifehub'],
            'parent segment' => ['/apps/../lifehub'],
            'query string' => ['/apps/lifehub?debug=1'],
        ];
    }

    public function testRejectsTheRemovedApiBasePathSetting(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('apiBasePath has been replaced by basePath');

        Settings::fromArray([
            'apiBasePath' => '/legacy/api',
            'dbName' => 'production_database',
            'dbUser' => 'production_user',
            'storagePath' => '/var/private/lifehub/uploads',
        ]);
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
