<?php

declare(strict_types=1);

namespace LifeHub\Weather;

use DateTimeImmutable;
use DateTimeZone;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Http\JsonResponder;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Throwable;

/** @phpstan-type Forecast array{date:string,condition:string,min:?float,max:?float,rain:?float} */
final class WeatherController
{
    public function __construct(
        private WeatherSettingsRepository $settings,
        private OpenMeteoClient $client,
        private string $storagePath
    ) {
    }

    public function today(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $request->getAttribute(UserContext::class);
        if (!$user instanceof UserContext) {
            throw new ApiException(401, 'auth.required', 'Authentication is required.');
        }
        $settings = $this->settings->read($user->householdId());
        $location = $settings['location'];
        $date = (new DateTimeImmutable('now', new DateTimeZone('Europe/Rome')))->format('Y-m-d');
        $forecast = $location === null ? null : $this->forecast(
            $user->householdId(),
            $settings['version'],
            $location['latitude'],
            $location['longitude'],
            $date
        );
        return JsonResponder::write($response, [
            'date' => $date, 'location' => $location['name'] ?? null, 'forecast' => $forecast,
        ])->withHeader('Cache-Control', 'private, no-store');
    }

    /** @return Forecast|null */
    private function forecast(int $householdId, int $version, float $lat, float $lon, string $date): ?array
    {
        // One private file per household, replaced when the day or configured location changes.
        $handle = @fopen($this->storagePath . '/weather-' . $householdId . '.json', 'c+');
        if ($handle === false) {
            return $this->fetch($lat, $lon, $date);
        }
        if (!flock($handle, LOCK_EX | LOCK_NB)) {
            fclose($handle);
            // Another request is refreshing: do not queue behind it or duplicate the provider call.
            return null;
        }
        try {
            $cached = json_decode(stream_get_contents($handle) ?: '', true);
            if (
                is_array($cached) && ($cached['version'] ?? null) === $version
                && ($cached['date'] ?? null) === $date && is_int($cached['expires'] ?? null)
                && $cached['expires'] > time() && array_key_exists('forecast', $cached)
            ) {
                $forecast = $this->validatedForecast($cached['forecast'], $date);
                if ($cached['forecast'] === null || $forecast !== null) {
                    return $forecast;
                }
            }
            $forecast = $this->fetch($lat, $lon, $date);
            // Short negative cache avoids repeated requests during a provider outage.
            $data = json_encode([
                'version' => $version, 'date' => $date,
                'expires' => time() + ($forecast === null ? 60 : 1800), 'forecast' => $forecast,
            ], JSON_THROW_ON_ERROR);
            rewind($handle);
            ftruncate($handle, 0);
            fwrite($handle, $data);
            fflush($handle);
            return $forecast;
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    /** @return Forecast|null */
    private function fetch(float $lat, float $lon, string $date): ?array
    {
        try {
            return $this->client->forecast($lat, $lon, 'Europe/Rome', $date, $date)[0] ?? null;
        } catch (Throwable) {
            return null;
        }
    }

    /** @return Forecast|null */
    private function validatedForecast(mixed $value, string $date): ?array
    {
        if (!is_array($value) || ($value['date'] ?? null) !== $date || !is_string($value['condition'] ?? null)) {
            return null;
        }
        foreach (['min', 'max', 'rain'] as $key) {
            if (
                !array_key_exists($key, $value)
                || ($value[$key] !== null && !is_int($value[$key]) && !is_float($value[$key]))
            ) {
                return null;
            }
        }
        return [
            'date' => $date, 'condition' => $value['condition'],
            'min' => $value['min'] === null ? null : (float) $value['min'],
            'max' => $value['max'] === null ? null : (float) $value['max'],
            'rain' => $value['rain'] === null ? null : (float) $value['rain'],
        ];
    }
}
