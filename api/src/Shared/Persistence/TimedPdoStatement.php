<?php

declare(strict_types=1);

namespace LifeHub\Shared\Persistence;

use LifeHub\Shared\Http\RequestTimings;
use PDOStatement;

final class TimedPdoStatement extends PDOStatement
{
    protected function __construct()
    {
    }

    /** @param array<int|string, mixed>|null $params */
    public function execute(?array $params = null): bool
    {
        return RequestTimings::measure('db_query', fn () => parent::execute($params));
    }
}
