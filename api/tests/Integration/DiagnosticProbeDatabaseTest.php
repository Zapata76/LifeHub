<?php

declare(strict_types=1);

namespace LifeHub\Tests\Integration;

use LifeHub\Diagnostics\DiagnosticProbe;
use LifeHub\Installation\SchemaInitializer;
use LifeHub\Shared\Config\Settings;
use LifeHub\Shared\Logging\StructuredLogger;
use LifeHub\Tests\Support\TemporaryDatabase;
use LifeHub\Tests\Support\TemporaryStorage;
use PDO;
use PHPUnit\Framework\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

final class DiagnosticProbeDatabaseTest extends TestCase
{
    public function testProbeReadsRealMyisamTablesWithoutChangingData(): void
    {
        if (getenv('LIFEHUB_TEST_DB') !== '1') {
            self::markTestSkipped('Set LIFEHUB_TEST_DB=1 to use an isolated MySQL database.');
        }
        $database = new TemporaryDatabase();
        $storage = new TemporaryStorage();
        try {
            $pdo = $database->pdo();
            (new SchemaInitializer($pdo, dirname(__DIR__, 3) . '/database/lifehub.sql'))->initialize(false);
            $insert = $pdo->prepare('INSERT INTO lh_tasks '
                . '(household_id, title, title_search, status, priority, '
                . 'created_by, created_at, updated_by, updated_at) '
                . "VALUES (?, 'private-title', 'private-title', 'todo', 'high', 1, NOW(), 1, NOW())");
            for ($i = 0; $i < 105; $i++) {
                $insert->execute([7]);
            }
            $insert->execute([8]);
            $checksum = 'CHECKSUM TABLE lh_tasks, lh_shopping_items, lh_meal_plan';
            $beforeQuery = $pdo->query($checksum);
            self::assertNotFalse($beforeQuery);
            $before = $beforeQuery->fetchAll();
            foreach ($before as $table) {
                self::assertNotNull($table['Checksum']);
            }
            $token = str_repeat('e', 64);
            $settings = Settings::fromArray([
                'dbName' => 'unused', 'dbUser' => 'unused', 'storagePath' => $storage->path(),
                'diagnosticProbeTokenHash' => hash('sha256', $token), 'diagnosticProbeHouseholdId' => '7',
            ]);
            $request = (new ServerRequestFactory())
                ->createServerRequest('GET', 'https://example.test/api/v1/diagnostics/probe')
                ->withHeader('X-LifeHub-Probe-Token', $token);
            $probe = new DiagnosticProbe($settings, new StructuredLogger(static function (string $line): void {
                self::assertStringNotContainsString('private-title', $line);
            }), fn (): PDO => $pdo);
            $response = $probe->handle($request, hrtime(true));
            self::assertSame(200, $response->getStatusCode());
            $afterQuery = $pdo->query($checksum);
            self::assertNotFalse($afterQuery);
            self::assertSame($before, $afterQuery->fetchAll());
            self::assertStringNotContainsString('private-title', (string) $response->getBody());
            foreach (['tasks_read', 'shopping_read', 'meals_read'] as $phase) {
                self::assertStringContainsString($phase . ';dur=', $response->getHeaderLine('Server-Timing'));
            }
        } finally {
            $database->drop();
            $storage->remove();
        }
    }
}
