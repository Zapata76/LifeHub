<?php

declare(strict_types=1);

namespace LifeHub\Tests\Unit;

use LifeHub\Weather\OpenMeteoClient;
use PHPUnit\Framework\TestCase;
use RuntimeException;

final class OpenMeteoClientTest extends TestCase
{
    public function testForecastRequestsOnlyTodayAndPreservesMissingValues(): void
    {
        $client = new OpenMeteoClient(function (string $url): array {
            self::assertSame('api.open-meteo.com', parse_url($url, PHP_URL_HOST));
            parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
            self::assertSame('2026-09-08', $query['start_date']);
            self::assertSame($query['start_date'], $query['end_date']);
            self::assertSame('Europe/Rome', $query['timezone']);
            return ['daily' => [
                'time' => ['2026-09-08', '2026-09-09'], 'weather_code' => [95, 0],
                'temperature_2m_min' => [null, 15], 'temperature_2m_max' => [26.5, 27],
                'precipitation_probability_max' => [0, 90],
            ]];
        });
        self::assertSame([
            ['date' => '2026-09-08', 'condition' => 'Temporali', 'min' => null, 'max' => 26.5, 'rain' => 0.0],
        ], $client->forecast(37.5, 15.09, 'Europe/Rome', '2026-09-08', '2026-09-08'));
    }

    public function testMissingForecastIsAnErrorInsteadOfInventingWeather(): void
    {
        $client = new OpenMeteoClient(static fn (string $url): array => []);
        $this->expectException(RuntimeException::class);
        $client->forecast(0, 0, 'UTC', '2026-09-08', '2026-09-08');
    }

    public function testLocationSearchUsesFixedHostAndDisambiguatesNames(): void
    {
        $client = new OpenMeteoClient(function (string $url): array {
            self::assertSame('geocoding-api.open-meteo.com', parse_url($url, PHP_URL_HOST));
            parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
            self::assertSame('Catania & Roma', $query['name']);
            return ['results' => [
                ['name' => 'Catania', 'admin1' => 'Sicilia', 'country' => 'Italia',
                    'latitude' => 37.5, 'longitude' => 15.09],
            ]];
        });
        self::assertSame([
            ['name' => 'Catania, Sicilia, Italia', 'latitude' => 37.5, 'longitude' => 15.09],
        ], $client->search('Catania & Roma'));
    }
}
