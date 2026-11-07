<?php

declare(strict_types=1);

namespace LifeHub\Shared\Persistence;

use LifeHub\Shared\Http\RequestTimings;
use PDO;
use PDOStatement;

/** Measures database calls without retaining SQL text or bound values. */
final class TimedPdo extends PDO
{
    /** @param array<int, mixed> $options */
    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        return RequestTimings::measure('db_query', fn () => parent::prepare($query, $options));
    }

    public function query(string $query, ?int $fetchMode = null, mixed ...$fetchModeArgs): PDOStatement|false
    {
        /** @var PDOStatement|false $result */
        $result = RequestTimings::measure('db_query', fn () => $fetchMode === null
            ? parent::query($query)
            : parent::query($query, $fetchMode, ...$fetchModeArgs));
        return $result;
    }

    public function exec(string $statement): int|false
    {
        /** @var int|false $result */
        $result = RequestTimings::measure('db_query', fn () => parent::exec($statement));
        return $result;
    }
}
