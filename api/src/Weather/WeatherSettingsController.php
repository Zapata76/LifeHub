<?php

declare(strict_types=1);

namespace LifeHub\Weather;

use LifeHub\Shared\Audit\AuditLogger;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Http\JsonResponder;
use LifeHub\Shared\Http\RequestData;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Throwable;

final class WeatherSettingsController
{
    public function __construct(
        private WeatherSettingsRepository $settings,
        private OpenMeteoClient $client,
        private AuditLogger $audit
    ) {
    }

    public function show(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return JsonResponder::write($response, $this->settings->read($this->admin($request)->householdId()));
    }

    public function update(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $this->admin($request);
        $data = new RequestData($request);
        if (!$data->has('location')) {
            throw new ApiException(422, 'validation.required', 'Indica la località o rimuovi il meteo.');
        }
        $location = $data->value('location');
        if ($location !== null) {
            if (
                !is_array($location) || !is_string($location['name'] ?? null)
                || trim($location['name']) === '' || mb_strlen($location['name'], 'UTF-8') > 190
            ) {
                throw new ApiException(422, 'weather.location_invalid', 'Indica un nome per la località.');
            }
            $location = [
                'name' => trim($location['name']),
                'latitude' => $this->coordinate($location['latitude'] ?? null, 90),
                'longitude' => $this->coordinate($location['longitude'] ?? null, 180),
            ];
        }
        $this->settings->update($user->householdId(), $location, $data->requiredInt('version'));
        $this->audit->record(
            $user,
            'household.weather_updated',
            'household',
            $user->householdId(),
            (string) $request->getAttribute('correlationId', 'unavailable')
        );
        return JsonResponder::write($response, $this->settings->read($user->householdId()));
    }

    public function search(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $this->admin($request);
        $query = $request->getQueryParams()['q'] ?? '';
        if (!is_string($query) || mb_strlen(trim($query), 'UTF-8') < 2 || mb_strlen($query, 'UTF-8') > 100) {
            throw new ApiException(422, 'weather.query_invalid', 'Inserisci da 2 a 100 caratteri.');
        }
        try {
            $locations = $this->client->search(trim($query));
        } catch (Throwable) {
            throw new ApiException(503, 'weather.unavailable', 'Ricerca meteo non disponibile. Riprova più tardi.');
        }
        return JsonResponder::write($response, ['items' => $locations]);
    }

    /** @param mixed $value */
    private function coordinate($value, int $limit): float
    {
        if ((!is_int($value) && !is_float($value)) || !is_finite((float) $value) || abs($value) > $limit) {
            throw new ApiException(422, 'weather.coordinates_invalid', 'Latitudine o longitudine non valida.');
        }
        return round((float) $value, 5);
    }

    private function admin(ServerRequestInterface $request): UserContext
    {
        $user = $request->getAttribute(UserContext::class);
        if (!$user instanceof UserContext || $user->role() !== 'admin') {
            throw new ApiException(403, 'authorization.denied', 'Accesso riservato agli amministratori.');
        }
        return $user;
    }
}
