<?php

declare(strict_types=1);

namespace LifeHub\Weather;

use Closure;
use RuntimeException;

final class OpenMeteoClient
{
    /** @var Closure(string):array<string,mixed> */
    private Closure $request;

    /** @param callable(string):array<string,mixed>|null $request */
    public function __construct(?callable $request = null)
    {
        $this->request = $request === null
            ? Closure::fromCallable([$this, 'getJson']) : Closure::fromCallable($request);
    }

    /** @return list<array{name:string,latitude:float,longitude:float}> */
    public function search(string $query): array
    {
        $data = ($this->request)('https://geocoding-api.open-meteo.com/v1/search?' . http_build_query([
            'name' => $query, 'count' => 10, 'language' => 'it', 'format' => 'json',
        ]));
        $locations = [];
        foreach ($data['results'] ?? [] as $row) {
            if (!isset($row['name'], $row['latitude'], $row['longitude'])) {
                continue;
            }
            $parts = array_filter([$row['name'], $row['admin1'] ?? '', $row['country'] ?? '']);
            $locations[] = [
                'name' => mb_substr(implode(', ', array_unique($parts)), 0, 190, 'UTF-8'),
                'latitude' => (float) $row['latitude'],
                'longitude' => (float) $row['longitude'],
            ];
        }
        return $locations;
    }

    /** @return list<array{date:string,condition:string,min:?float,max:?float,rain:?float}> */
    public function forecast(float $latitude, float $longitude, string $timezone, string $start, string $end): array
    {
        $data = ($this->request)('https://api.open-meteo.com/v1/forecast?' . http_build_query([
            'latitude' => $latitude, 'longitude' => $longitude, 'timezone' => $timezone,
            'start_date' => $start, 'end_date' => $end, 'temperature_unit' => 'celsius',
            'daily' => 'weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max',
        ]));
        $daily = $data['daily'] ?? [];
        $days = [];
        foreach ($daily['time'] ?? [] as $index => $date) {
            if (
                !is_string($date) || preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) !== 1
                || $date < $start || $date > $end
            ) {
                continue;
            }
            $code = $daily['weather_code'][$index] ?? null;
            $days[] = [
                'date' => $date,
                'condition' => self::condition(is_numeric($code) ? (int) $code : null),
                'min' => self::number($daily['temperature_2m_min'][$index] ?? null),
                'max' => self::number($daily['temperature_2m_max'][$index] ?? null),
                'rain' => self::number($daily['precipitation_probability_max'][$index] ?? null),
            ];
        }
        if ($days === []) {
            throw new RuntimeException('weather.unavailable');
        }
        usort($days, static fn (array $a, array $b): int => strcmp($a['date'], $b['date']));
        return $days;
    }

    /** @param mixed $value */
    private static function number($value): ?float
    {
        return is_numeric($value) && is_finite((float) $value) ? (float) $value : null;
    }

    private static function condition(?int $code): string
    {
        return match ($code) {
            0 => 'Sereno', 1 => 'Prevalentemente sereno', 2 => 'Parzialmente nuvoloso', 3 => 'Coperto',
            45, 48 => 'Nebbia', 51, 53, 55 => 'Pioviggine', 56, 57 => 'Pioviggine gelata',
            61, 63, 65 => 'Pioggia', 66, 67 => 'Pioggia gelata', 71, 73, 75, 77 => 'Neve',
            80, 81, 82 => 'Rovesci di pioggia', 85, 86 => 'Rovesci di neve',
            95 => 'Temporali', 96, 99 => 'Temporali con grandine', default => 'Condizioni non disponibili',
        };
    }

    /** @return array<string,mixed> */
    private function getJson(string $url): array
    {
        // URLs are built exclusively from the two fixed HTTPS endpoints above. No redirects.
        if (function_exists('curl_init')) {
            $handle = curl_init($url);
            if ($handle === false) {
                throw new RuntimeException('weather.unavailable');
            }
            curl_setopt_array($handle, [
                CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_TIMEOUT => 8,
                CURLOPT_FOLLOWLOCATION => false, CURLOPT_HTTPHEADER => ['Accept: application/json'],
            ]);
            if (PHP_OS_FAMILY === 'Windows' && defined('CURLSSLOPT_NATIVE_CA')) {
                curl_setopt($handle, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
            }
            $body = curl_exec($handle);
            $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
            unset($handle);
        } else {
            $context = stream_context_create(['http' => [
                'timeout' => 8, 'follow_location' => 0, 'ignore_errors' => true,
                'header' => "Accept: application/json\r\n",
            ]]);
            $body = @file_get_contents($url, false, $context, 0, 1048576);
            $headers = http_get_last_response_headers() ?? [];
            $status = preg_match('/\s(\d{3})\s/', $headers[0] ?? '', $match) === 1 ? (int) $match[1] : 0;
        }
        if ($status !== 200 || !is_string($body) || strlen($body) > 1048576) {
            throw new RuntimeException('weather.unavailable');
        }
        $data = json_decode($body, true, 32, JSON_THROW_ON_ERROR);
        if (!is_array($data) || isset($data['error'])) {
            throw new RuntimeException('weather.unavailable');
        }
        return $data;
    }
}
