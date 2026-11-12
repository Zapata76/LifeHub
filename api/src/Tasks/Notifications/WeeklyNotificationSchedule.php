<?php

declare(strict_types=1);

namespace LifeHub\Tasks\Notifications;

use DateTimeImmutable;
use DateTimeZone;

/** Fixed Italian weekly cutoff; calendar arithmetic preserves 06:00 across DST changes. */
final class WeeklyNotificationSchedule
{
    public readonly DateTimeImmutable $now;
    public readonly DateTimeImmutable $start;
    public readonly DateTimeImmutable $end;

    public function __construct(?DateTimeImmutable $now = null)
    {
        $timezone = new DateTimeZone('Europe/Rome');
        $this->now = ($now ?? new DateTimeImmutable('now', $timezone))->setTimezone($timezone);
        $daysSinceSaturday = ((int) $this->now->format('N') + 1) % 7;
        $end = $this->now->setTime(6, 0)->modify('-' . $daysSinceSaturday . ' days');
        if ($end > $this->now) {
            $end = $end->modify('-7 days');
        }
        $this->end = $end;
        $this->start = $end->modify('-7 days');
    }

    public function isDue(): bool
    {
        return $this->now->format('N') === '6' && (int) $this->now->format('G') >= 6;
    }

    public function deliveryDate(): string
    {
        return $this->end->format('Y-m-d');
    }

    public function nextRun(): string
    {
        return $this->end->modify('+7 days')->format(DATE_ATOM);
    }
}
