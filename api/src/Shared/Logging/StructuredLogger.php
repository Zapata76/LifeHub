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

    /** @param array<string, float> $timings */
    public function httpRequest(
        string $correlationId,
        string $method,
        string $route,
        int $status,
        float $durationMs,
        ?string $errorCode,
        array $timings = []
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
        if ($timings !== []) {
            $payload['timings_ms'] = [];
            foreach (\LifeHub\Shared\Http\RequestTimings::NAMES as $name) {
                if (isset($timings[$name]) && is_finite($timings[$name])) {
                    $payload['timings_ms'][$name] = round(max(0.0, $timings[$name]), 2);
                }
            }
        }
        $this->write($payload);
    }

    /** @param array<string, float> $timings */
    public function diagnosticProbe(string $correlationId, int $status, ?string $errorCode, array $timings): void
    {
        $safe = [];
        foreach (\LifeHub\Diagnostics\DiagnosticProbe::PHASES as $phase) {
            if (isset($timings[$phase]) && is_finite($timings[$phase])) {
                $safe[$phase] = round(max(0.0, $timings[$phase]), 2);
            }
        }
        $this->write([
            'timestamp' => gmdate('c'), 'event' => 'diagnostic.probe',
            'correlation_id' => $correlationId, 'route' => '/api/v1/diagnostics/probe',
            'status' => $status, 'error_code' => $errorCode, 'timings_ms' => $safe,
        ]);
    }

    public function pushDelivery(
        string $correlationId,
        float $durationMs,
        int $sent,
        int $failed,
        int $expired,
        ?string $errorCode = null
    ): void {
        $this->write([
            'timestamp' => gmdate('c'), 'event' => 'push.delivery', 'correlation_id' => $correlationId,
            'route' => 'tasks.completed', 'duration_ms' => round($durationMs, 2),
            'sent' => $sent, 'failed' => $failed, 'expired' => $expired,
            'error_code' => $errorCode ?? ($failed > 0 ? 'push.some_failed' : null),
        ]);
    }

    /** @param array<string,mixed> $payload */
    private function write(array $payload): void
    {
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
