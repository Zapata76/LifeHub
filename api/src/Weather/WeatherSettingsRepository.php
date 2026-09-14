<?php

declare(strict_types=1);

namespace LifeHub\Weather;

use LifeHub\Shared\Http\ApiException;
use PDO;

final class WeatherSettingsRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    /** @return array{location:?array{name:string,latitude:float,longitude:float},version:int} */
    public function read(int $householdId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT weather_name, weather_latitude, weather_longitude, weather_version '
            . 'FROM lh_households WHERE id = ?'
        );
        $statement->execute([$householdId]);
        $row = $statement->fetch();
        if (!is_array($row)) {
            throw new ApiException(404, 'household.not_found', 'Famiglia non trovata.');
        }
        $location = null;
        if ($row['weather_name'] !== null && $row['weather_latitude'] !== null && $row['weather_longitude'] !== null) {
            $location = [
                'name' => (string) $row['weather_name'],
                'latitude' => (float) $row['weather_latitude'],
                'longitude' => (float) $row['weather_longitude'],
            ];
        }
        return ['location' => $location, 'version' => (int) $row['weather_version']];
    }

    /** @param array{name:string,latitude:float,longitude:float}|null $location */
    public function update(int $householdId, ?array $location, int $version): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE lh_households SET weather_name = ?, weather_latitude = ?, weather_longitude = ?, '
            . 'weather_version = weather_version + 1, updated_at = ? WHERE id = ? AND weather_version = ?'
        );
        $statement->execute([
            $location['name'] ?? null, $location['latitude'] ?? null, $location['longitude'] ?? null,
            gmdate('Y-m-d H:i:s'), $householdId, $version,
        ]);
        if ($statement->rowCount() !== 1) {
            throw new ApiException(409, 'version.conflict', 'La località è cambiata. Ricarica le impostazioni meteo.');
        }
    }
}
