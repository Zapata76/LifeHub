<?php

declare(strict_types=1);

namespace LifeHub\Tests\Unit;

use LifeHub\Shared\Logging\StructuredLogger;
use PHPUnit\Framework\TestCase;

final class StructuredLoggerTest extends TestCase
{
    public function testItWritesOnlyOperationalRequestMetadataAsJson(): void
    {
        $lines = [];
        $logger = new StructuredLogger(function (string $line) use (&$lines): void {
            $lines[] = $line;
        });

        $logger->httpRequest('correlation-123', 'GET', '/api/v1/inventory/{id}', 404, 12.345, 'item.missing');

        self::assertCount(1, $lines);
        $payload = json_decode($lines[0], true);
        self::assertIsArray($payload);
        self::assertSame('http.request', $payload['event']);
        self::assertSame('correlation-123', $payload['correlation_id']);
        self::assertSame('/api/v1/inventory/{id}', $payload['route']);
        self::assertSame(404, $payload['status']);
        self::assertSame(12.35, $payload['duration_ms']);
        self::assertSame('item.missing', $payload['error_code']);
        self::assertArrayNotHasKey('body', $payload);
        self::assertArrayNotHasKey('query', $payload);
    }
}
