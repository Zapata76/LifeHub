<?php

declare(strict_types=1);

namespace LifeHub\Tests\Unit;

use DateTimeImmutable;
use DateTimeZone;
use LifeHub\Tasks\Notifications\WeeklyNotificationSchedule;
use PHPUnit\Framework\TestCase;

final class WeeklyNotificationScheduleTest extends TestCase
{
    public function testOnlySaturdayFromSixItalianTimeIsDue(): void
    {
        $utc = new DateTimeZone('UTC');
        foreach (['2026-11-06 12:00:00', '2026-11-07 04:59:59', '2026-11-08 05:00:00'] as $time) {
            self::assertFalse((new WeeklyNotificationSchedule(new DateTimeImmutable($time, $utc)))->isDue());
        }
        foreach (['2026-11-07 05:00:00', '2026-11-07 22:59:59', '2026-07-04 04:00:00'] as $time) {
            self::assertTrue((new WeeklyNotificationSchedule(new DateTimeImmutable($time, $utc)))->isDue());
        }
    }

    public function testWeeklyWindowUsesCalendarDaysAcrossBothDstChanges(): void
    {
        $rome = new DateTimeZone('Europe/Rome');
        foreach ([['2026-04-04 06:00:00', 167], ['2026-10-31 06:00:00', 169]] as [$date, $hours]) {
            $schedule = new WeeklyNotificationSchedule(new DateTimeImmutable($date, $rome));
            self::assertSame('06:00', $schedule->start->format('H:i'));
            self::assertSame('06:00', $schedule->end->format('H:i'));
            self::assertSame($hours * 3600, $schedule->end->getTimestamp() - $schedule->start->getTimestamp());
        }
    }

    public function testTheCutoffDoesNotMoveWithLateRetries(): void
    {
        $schedule = new WeeklyNotificationSchedule(new DateTimeImmutable('2026-11-07 20:00:00+01:00'));
        self::assertSame('2026-11-07', $schedule->deliveryDate());
        self::assertSame('2026-10-31T06:00:00+01:00', $schedule->start->format(DATE_ATOM));
        self::assertSame('2026-11-07T06:00:00+01:00', $schedule->end->format(DATE_ATOM));
        self::assertSame('2026-11-14T06:00:00+01:00', $schedule->nextRun());
    }
}
