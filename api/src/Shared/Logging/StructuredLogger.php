<?php

/** Emits one-line JSON operational events through PHP's configured error log. */

declare(strict_types=1);

namespace LifeHub\Shared\Logging;

use Closure;
use Throwable;

final class StructuredLogger
{
    /** @var Closure(string): void */
    private $writer;

    public function __construct(?callable $writer = null)
    {
        $this->writer = $writer === null
            ? function (string $line): void {
                error_log($line);
            }
            : Closure::fromCallable($writer);
    }

    public function httpRequest(
        string $correlationId,
        string $method,
        string $route,
        int $status,
        float $durationMs,
        ?string $errorCode
    ): void {
        $payload = [
            'timestamp' => gmdate('c'),
            'event' => 'http.request',
            'correlation_id' => $correlationId,
            'method' => $method,
            'route' => $route,
            'status' => $status,
            'duration_ms' => round($durationMs, 2),
            'error_code' => $errorCode,
        ];
        $line = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($line)) {
            return;
        }
        try {
            ($this->writer)($line);
        } catch (Throwable) {
            // Observability must never change the API response.
        }
    }
}
