<?php

declare(strict_types=1);

namespace LifeHub\Tests\Unit;

use LifeHub\Shared\Http\RequestTimings;
use PHPUnit\Framework\TestCase;
use RuntimeException;

final class RequestTimingsTest extends TestCase
{
    public function testNestedPhasesAreExclusiveAndFailuresAreMeasured(): void
    {
        $timings = new RequestTimings();
        $previous = RequestTimings::activate($timings);
        try {
            RequestTimings::measure('authentication', function (): void {
                RequestTimings::measure('db_query', function (): void {
                    usleep(20000);
                });
                RequestTimings::measure('response_encoding', function (): void {
                    usleep(10000);
                    throw new RuntimeException('not logged');
                });
            });
        } catch (RuntimeException $error) {
            self::assertSame('not logged', $error->getMessage());
        } finally {
            RequestTimings::activate($previous);
        }
        $metrics = $timings->snapshot();
        self::assertGreaterThanOrEqual(19, $metrics['db_query']);
        self::assertGreaterThanOrEqual(9, $metrics['response_encoding']);
        $sum = array_sum(array_diff_key($metrics, ['app_total' => true]));
        self::assertEqualsWithDelta($metrics['app_total'], $sum, 0.05);
        self::assertStringNotContainsString('not logged', RequestTimings::header($metrics));
        self::assertSame(42, RequestTimings::measure('db_query', fn () => 42));
        self::assertSame($metrics['db_query'], $timings->snapshot()['db_query']);
    }
}
