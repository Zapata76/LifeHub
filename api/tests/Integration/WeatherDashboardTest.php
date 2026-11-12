<?php

declare(strict_types=1);

namespace LifeHub\Tests\Integration;

use DateTimeImmutable;
use DateTimeZone;
use LifeHub\Installation\SchemaInitializer;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Tests\Support\TemporaryDatabase;
use LifeHub\Tests\Support\TemporaryStorage;
use LifeHub\Weather\OpenMeteoClient;
use LifeHub\Weather\WeatherController;
use LifeHub\Weather\WeatherSettingsRepository;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Response;

final class WeatherDashboardTest extends TestCase
{
    private ?TemporaryDatabase $database = null;
    private ?TemporaryStorage $storage = null;
    private WeatherSettingsRepository $settings;

    protected function setUp(): void
    {
        if (getenv('LIFEHUB_TEST_DB') !== '1') {
            self::markTestSkipped('Set LIFEHUB_TEST_DB=1 for isolated weather tests.');
        }
        $this->database = new TemporaryDatabase();
        $this->storage = new TemporaryStorage();
        $pdo = $this->database->pdo();
        (new SchemaInitializer($pdo, dirname(__DIR__, 3) . '/database/lifehub.sql'))->initialize(false);
        $pdo->exec('INSERT INTO lh_households (id, name, timezone, created_at, updated_at) '
            . "VALUES (1, 'First', 'Europe/Rome', NOW(), NOW()), (2, 'Second', 'Europe/Rome', NOW(), NOW())");
        $this->settings = new WeatherSettingsRepository($pdo);
        $this->settings->update(1, ['name' => 'Casa', 'latitude' => 37.5, 'longitude' => 15.09], 1);
    }

    protected function tearDown(): void
    {
        $this->database?->drop();
        $this->storage?->remove();
    }

    /**
     * @return array<string,mixed>
     * @phpstan-impure Requests can update the forecast cache.
     */
    private function read(WeatherController $controller, int $household = 1): array
    {
        $request = (new ServerRequestFactory())->createServerRequest('GET', '/api/v1/weather/today')
            ->withAttribute(UserContext::class, new UserContext(1, $household, 'Reader', 'child'));
        $response = $controller->today($request, new Response());
        self::assertSame('private, no-store', $response->getHeaderLine('Cache-Control'));
        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }

    public function testTodayIsScopedCachedAndRefreshedAfterDateOrLocationChanges(): void
    {
        self::assertNotNull($this->storage);
        $storagePath = $this->storage->path();
        $calls = 0;
        $today = (new DateTimeImmutable('now', new DateTimeZone('Europe/Rome')))->format('Y-m-d');
        $client = new OpenMeteoClient(function (string $url) use (&$calls, $today): array {
            $calls++;
            parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
            self::assertSame($today, $query['start_date']);
            self::assertSame($today, $query['end_date']);
            self::assertSame('Europe/Rome', $query['timezone']);
            return ['daily' => [
                'time' => [$today], 'weather_code' => [0],
                'temperature_2m_min' => [null], 'temperature_2m_max' => [0],
                'precipitation_probability_max' => [0],
            ]];
        });
        $controller = new WeatherController($this->settings, $client, $storagePath);
        $report = $this->read($controller);
        self::assertSame('Casa', $report['location']);
        self::assertSame($today, $report['forecast']['date']);
        self::assertSame('Sereno', $report['forecast']['condition']);
        self::assertNull($report['forecast']['min']);
        self::assertSame(0, $report['forecast']['rain']);
        self::assertSame($report, $this->read($controller));
        self::assertSame(1, $calls);
        self::assertNull($this->read($controller, 2)['location']);
        self::assertSame(1, $calls);

        $cache = $storagePath . '/weather-1.json';
        $saved = json_decode((string) file_get_contents($cache), true);
        $saved['date'] = '2000-01-01';
        file_put_contents($cache, json_encode($saved));
        $this->read($controller);
        self::assertSame(2, $calls, 'Yesterday must never be served as today.');
        $this->settings->update(1, ['name' => 'Nuova casa', 'latitude' => 0, 'longitude' => 0], 2);
        self::assertSame('Nuova casa', $this->read($controller)['location']);
        self::assertSame(3, $calls, 'Changing the location invalidates its cached forecast.');
        $this->settings->update(2, ['name' => 'Other home', 'latitude' => 1, 'longitude' => 1], 1);
        self::assertSame('Other home', $this->read($controller, 2)['location']);
        self::assertSame(4, $calls);
        $this->settings->update(1, null, 3);
        self::assertNull($this->read($controller)['forecast']);
        self::assertSame(4, $calls, 'Disabled weather must not call the provider.');
    }

    public function testProviderFailureIsBrieflyCachedAndCanRecover(): void
    {
        self::assertNotNull($this->storage);
        $storagePath = $this->storage->path();
        $calls = 0;
        $client = new OpenMeteoClient(function (string $url) use (&$calls): array {
            $calls++;
            if ($calls === 1) {
                throw new RuntimeException('Provider offline');
            }
            parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
            return ['daily' => ['time' => [$query['start_date']], 'weather_code' => [3]]];
        });
        $controller = new WeatherController($this->settings, $client, $storagePath);
        $report = $this->read($controller);
        self::assertSame('Casa', $report['location']);
        self::assertNull($report['forecast']);
        self::assertSame($report, $this->read($controller));
        self::assertSame(1, $calls);
        $cache = $storagePath . '/weather-1.json';
        $saved = json_decode((string) file_get_contents($cache), true);
        $saved['expires'] = 0;
        file_put_contents($cache, json_encode($saved));
        self::assertSame('Coperto', $this->read($controller)['forecast']['condition']);
        self::assertSame(2, $calls);
        file_put_contents($cache, '{broken cache');
        self::assertSame('Coperto', $this->read($controller)['forecast']['condition']);
        self::assertSame(3, $calls);
        $lock = fopen($cache, 'c+');
        self::assertIsResource($lock);
        flock($lock, LOCK_EX);
        try {
            self::assertNull($this->read($controller)['forecast']);
            self::assertSame(3, $calls, 'A concurrent refresh does not start another provider request.');
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    public function testWeatherRequiresAuthentication(): void
    {
        self::assertNotNull($this->storage);
        $controller = new WeatherController($this->settings, new OpenMeteoClient(), $this->storage->path());
        $this->expectException(ApiException::class);
        $controller->today(
            (new ServerRequestFactory())->createServerRequest('GET', '/api/v1/weather/today'),
            new Response()
        );
    }
}
