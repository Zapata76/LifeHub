<?php

declare(strict_types=1);

namespace LifeHub\Tests\Integration;

use LifeHub\Shared\Http\RequestTimings;
use LifeHub\Shared\Persistence\TimedPdoStatement;
use LifeHub\Tests\Support\TemporaryDatabase;
use PDO;
use PDOException;
use PHPUnit\Framework\TestCase;

final class QueryTimingsTest extends TestCase
{
    public function testPreparedDirectAndFailedQueriesAreMeasuredWithoutChangingResults(): void
    {
        if (getenv('LIFEHUB_TEST_DB') !== '1') {
            self::markTestSkipped('Set LIFEHUB_TEST_DB=1 for isolated MySQL tests.');
        }
        $database = new TemporaryDatabase();
        $timings = new RequestTimings();
        $previous = RequestTimings::activate($timings);
        try {
            $pdo = $database->pdo();
            $statement = $pdo->prepare('SELECT ? AS value, SLEEP(0.02) AS waited');
            self::assertInstanceOf(TimedPdoStatement::class, $statement);
            self::assertTrue($statement->execute(['private-value']));
            self::assertSame('private-value', $statement->fetchColumn());
            $prepared = $timings->snapshot()['db_query'];
            self::assertGreaterThanOrEqual(19, $prepared);
            $result = $pdo->query('SELECT SLEEP(0.02)', PDO::FETCH_NUM);
            self::assertNotFalse($result);
            self::assertSame(0, (int) $result->fetchColumn());
            self::assertGreaterThan($prepared, $timings->snapshot()['db_query']);
            self::assertSame(0, $pdo->exec('SET @lifehub_timing_probe = 1'));
            $beforeFailure = $timings->snapshot()['db_query'];
            try {
                $pdo->query('SELECT * FROM missing_timing_probe_table');
                self::fail('Invalid SQL must still throw');
            } catch (PDOException) {
                self::assertGreaterThanOrEqual($beforeFailure, $timings->snapshot()['db_query']);
            }
            self::assertStringNotContainsString('private-value', RequestTimings::header($timings->snapshot()));
        } finally {
            RequestTimings::activate($previous);
            $database->drop();
        }
    }
}
