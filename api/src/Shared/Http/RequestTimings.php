<?php

/** Request-local timings; no SQL, paths, session identifiers or user data. */

declare(strict_types=1);

namespace LifeHub\Shared\Http;

final class RequestTimings
{
    public const NAMES = ['db_connect', 'bootstrap', 'session_start', 'authentication', 'db_query',
        'response_encoding', 'processing', 'app_total'];
    private static ?self $active = null;
    /** @var array<string, float> */
    private array $phases = [];
    /** @var list<float> */
    private array $children = [];

    public static function activate(?self $timings): ?self
    {
        $previous = self::$active;
        self::$active = $timings;
        return $previous;
    }

    /**
     * @template T
     * @param callable(): T $operation
     * @return T
     * @throws \Throwable
     */
    public static function measure(string $phase, callable $operation): mixed
    {
        $timings = self::$active;
        if ($timings === null) {
            return $operation();
        }
        $started = hrtime(true);
        $timings->children[] = 0.0;
        try {
            return $operation();
        } finally {
            $elapsed = (hrtime(true) - $started) / 1000000;
            $children = array_pop($timings->children);
            $timings->phases[$phase] = ($timings->phases[$phase] ?? 0.0) + max(0.0, $elapsed - $children);
            $parent = count($timings->children) - 1;
            if ($parent >= 0) {
                $timings->children[$parent] += $elapsed;
            }
        }
    }
    private int $startedAt;
    private float $sessionStartMs = 0.0;

    public function __construct(private float $dbConnectMs = 0.0, private float $bootstrapMs = 0.0)
    {
        $this->startedAt = hrtime(true);
    }

    public function sessionOpened(float $milliseconds): void
    {
        $this->sessionStartMs += max(0.0, $milliseconds);
    }

    /** @return array<string, float> Durations in milliseconds, before response body emission. */
    public function snapshot(): array
    {
        $elapsed = (hrtime(true) - $this->startedAt) / 1000000;
        return [
            'db_connect' => round($this->dbConnectMs, 2),
            'bootstrap' => round($this->bootstrapMs, 2),
            // Includes lock wait AND reading/initializing the PHP session, not just lock wait.
            'session_start' => round($this->sessionStartMs, 2),
            'authentication' => round($this->phases['authentication'] ?? 0.0, 2),
            'db_query' => round($this->phases['db_query'] ?? 0.0, 2),
            'response_encoding' => round($this->phases['response_encoding'] ?? 0.0, 2),
            'processing' => round(max(0.0, $elapsed - $this->sessionStartMs - array_sum($this->phases)), 2),
            'app_total' => round($this->dbConnectMs + $this->bootstrapMs + $elapsed, 2),
        ];
    }

    /** @param array<string, float> $metrics */
    public static function header(array $metrics): string
    {
        $parts = [];
        foreach (self::NAMES as $name) {
            $parts[] = $name . ';dur=' . number_format($metrics[$name] ?? 0.0, 2, '.', '');
        }
        return implode(', ', $parts);
    }
}
