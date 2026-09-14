<?php

declare(strict_types=1);

namespace LifeHub\Weather;

use DateTimeImmutable;
use Throwable;

final class WeatherSummary
{
    public function __construct(private WeatherSettingsRepository $settings, private OpenMeteoClient $client)
    {
    }

    /** @return array{string,string} */
    public function message(int $householdId, DateTimeImmutable $localNow): array
    {
        try {
            $location = $this->settings->read($householdId)['location'];
            if ($location === null) {
                return ['', ''];
            }
            $days = $this->client->forecast(
                $location['latitude'],
                $location['longitude'],
                $localNow->getTimezone()->getName(),
                $localNow->format('Y-m-d'),
                $localNow->format('Y-m-d')
            );
            $lines = [];
            foreach ($days as $day) {
                $lines[] = (new DateTimeImmutable($day['date']))->format('d/m/Y') . ' — ' . $day['condition']
                    . ', min ' . $this->number($day['min'], ' °C') . ', max ' . $this->number($day['max'], ' °C')
                    . ', probabilità di pioggia ' . $this->number($day['rain'], '%');
            }
            $heading = 'Meteo di oggi · ' . $location['name'];
            $html = '<h2>' . $this->escape($heading) . '</h2><ul>';
            foreach ($lines as $line) {
                $html .= '<li>' . $this->escape($line) . '</li>';
            }
            return [
                $html . '</ul><p>Previsioni: <a href="https://open-meteo.com/">Open-Meteo</a>.</p>',
                $heading . ":\n\n- " . implode("\n- ", $lines) . "\n\nPrevisioni: Open-Meteo https://open-meteo.com/",
            ];
        } catch (Throwable) {
            // Weather is optional: provider or configuration failures must not prevent the daily email.
            $message = 'Previsioni meteo temporaneamente non disponibili.';
            return ['<p>' . $message . '</p>', $message];
        }
    }

    private function number(?float $value, string $unit): string
    {
        return $value === null ? 'n/d' : number_format($value, 0, ',', '') . $unit;
    }

    private function escape(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
