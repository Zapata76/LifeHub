<?php

declare(strict_types=1);

namespace LifeHub\Tests\Integration;

use DateTimeImmutable;
use LifeHub\Installation\SchemaInitializer;
use LifeHub\Shared\Audit\AuditLogger;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Tasks\Notifications\TaskNotificationRepository;
use LifeHub\Tasks\Notifications\TaskNotificationService;
use LifeHub\Tests\Support\RecordingTaskNotificationMailer;
use LifeHub\Tests\Support\TemporaryDatabase;
use LifeHub\Weather\OpenMeteoClient;
use LifeHub\Weather\WeatherSettingsController;
use LifeHub\Weather\WeatherSettingsRepository;
use LifeHub\Weather\WeatherSummary;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Response;

final class WeatherNotificationTest extends TestCase
{
    private ?TemporaryDatabase $database = null;

    protected function setUp(): void
    {
        if (getenv('LIFEHUB_TEST_DB') !== '1') {
            self::markTestSkipped('Set LIFEHUB_TEST_DB=1 to run database tests.');
        }
        $this->database = new TemporaryDatabase();
        $pdo = $this->database->pdo();
        (new SchemaInitializer($pdo, dirname(__DIR__, 3) . '/database/lifehub.sql'))->initialize(false);
        $pdo->exec(
            'INSERT INTO lh_households (id, name, timezone, created_at, updated_at) '
            . "VALUES (1, 'Family', 'Pacific/Auckland', NOW(), NOW()), (2, 'Other', 'UTC', NOW(), NOW())"
        );
    }

    protected function tearDown(): void
    {
        $this->database?->drop();
    }

    public function testAdminSettingsValidateCoordinatesAndPreventLostUpdates(): void
    {
        self::assertNotNull($this->database);
        $pdo = $this->database->pdo();
        $repository = new WeatherSettingsRepository($pdo);
        $controller = new WeatherSettingsController(
            $repository,
            new OpenMeteoClient(),
            new AuditLogger($pdo)
        );
        $request = (new ServerRequestFactory())->createServerRequest('PUT', '/api/v1/admin/weather-settings')
            ->withAttribute(UserContext::class, new UserContext(1, 1, 'admin', 'admin'));
        $location = ['name' => 'Casa', 'latitude' => 0, 'longitude' => 0];
        $response = $controller->update(
            $request->withParsedBody(['location' => $location, 'version' => 1]),
            new Response()
        );
        self::assertSame(200, $response->getStatusCode());
        self::assertSame(['name' => 'Casa', 'latitude' => 0.0, 'longitude' => 0.0], $repository->read(1)['location']);
        self::assertNull($repository->read(2)['location']);
        $invalidLocations = [
            [array_merge($location, ['latitude' => 91]), 2, 'weather.coordinates_invalid'],
            [array_merge($location, ['longitude' => -181]), 2, 'weather.coordinates_invalid'],
            [array_merge($location, ['latitude' => '']), 2, 'weather.coordinates_invalid'],
            [array_merge($location, ['name' => ' ']), 2, 'weather.location_invalid'],
            [$location, 1, 'version.conflict'],
        ];
        foreach ($invalidLocations as [$invalid, $version, $code]) {
            try {
                $controller->update(
                    $request->withParsedBody(['location' => $invalid, 'version' => $version]),
                    new Response()
                );
                self::fail('Invalid update accepted.');
            } catch (ApiException $exception) {
                self::assertSame($code, $exception->apiCode());
            }
        }
        $controller->update($request->withParsedBody(['location' => null, 'version' => 2]), new Response());
        self::assertSame(['location' => null, 'version' => 3], $repository->read(1));
        foreach (['show', 'search', 'update'] as $method) {
            try {
                $controller->$method(
                    $request->withAttribute(UserContext::class, new UserContext(2, 1, 'adult', 'adult')),
                    new Response()
                );
                self::fail('Non-admin access accepted.');
            } catch (ApiException $exception) {
                self::assertSame(403, $exception->status());
            }
        }
    }

    public function testEmailIncludesOnlyTodayCachesForecastAndSurvivesProviderFailure(): void
    {
        self::assertNotNull($this->database);
        $pdo = $this->database->pdo();
        $settings = new WeatherSettingsRepository($pdo);
        $settings->update(1, ['name' => 'Casa <test>', 'latitude' => 37.5, 'longitude' => 15.09], 1);
        for ($id = 1; $id <= 2; $id++) {
            $pdo->exec(
                'INSERT INTO lh_users (id, household_id, username, username_key, role, status, email, '
                . "created_at, updated_at) VALUES ($id, 1, 'user$id', 'user$id', 'adult', 'active', "
                . "'user$id@example.test', NOW(), NOW())"
            );
            $pdo->exec(
                'INSERT INTO lh_tasks (household_id, title, title_search, assigned_to, status, priority, '
                . 'created_by, created_at, updated_by, updated_at) '
                . "VALUES (1, 'Task', 'task', $id, 'open', 'normal', 1, NOW(), 1, NOW())"
            );
        }
        $calls = 0;
        $client = new OpenMeteoClient(function (string $url) use (&$calls): array {
            $calls++;
            if ($calls > 1) {
                throw new RuntimeException('Provider offline');
            }
            parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
            self::assertSame('2026-09-08', $query['start_date']);
            self::assertSame($query['start_date'], $query['end_date']);
            self::assertSame('Pacific/Auckland', $query['timezone']);
            return ['daily' => [
                'time' => ['2026-09-08', '2026-09-09'], 'weather_code' => [0, 95],
                'temperature_2m_min' => [18, 15], 'temperature_2m_max' => [27, 25],
                'precipitation_probability_max' => [10, 90],
            ]];
        });
        $mailer = new RecordingTaskNotificationMailer();
        $service = new TaskNotificationService(
            new TaskNotificationRepository($pdo),
            $mailer,
            'Test',
            'https://example.test',
            new WeatherSummary($settings, $client)
        );
        $today = new DateTimeImmutable('2026-09-07 20:30:00 UTC');
        self::assertSame(2, $service->run($today)['sent']);
        self::assertSame(2, $service->run($today)['alreadyHandled']);
        self::assertSame(1, $calls);
        self::assertStringContainsString('Meteo di oggi · Casa &lt;test&gt;', $mailer->messages[0]['html']);
        self::assertStringContainsString('08/09/2026 — Sereno, min 18 °C, max 27 °C', $mailer->messages[0]['text']);
        self::assertStringContainsString('probabilità di pioggia 10%', $mailer->messages[0]['text']);
        self::assertStringNotContainsString('09/09/2026', $mailer->messages[0]['text']);
        self::assertSame(2, $service->run($today->modify('+1 day'))['sent']);
        self::assertSame(2, $calls);
        self::assertStringContainsString('Task', $mailer->messages[2]['text']);
        self::assertStringContainsString(
            'Previsioni meteo temporaneamente non disponibili.',
            $mailer->messages[2]['html']
        );
        $settings->update(1, null, 2);
        self::assertSame(2, $service->run($today->modify('+2 days'))['sent']);
        self::assertSame(2, $calls);
        self::assertStringNotContainsString('Meteo', $mailer->messages[4]['html']);
    }
}
