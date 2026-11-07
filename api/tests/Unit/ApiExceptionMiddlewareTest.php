<?php

declare(strict_types=1);

namespace LifeHub\Tests\Unit;

use LifeHub\Shared\Http\ApiExceptionMiddleware;
use LifeHub\Shared\Http\JsonResponder;
use LifeHub\Shared\Logging\StructuredLogger;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;

final class ApiExceptionMiddlewareTest extends TestCase
{
    public function testItLogsTheCanonicalCodeOfAnErrorResponseWithoutConsumingItsBody(): void
    {
        $lines = [];
        $logger = new StructuredLogger(function (string $line) use (&$lines): void {
            $lines[] = $line;
        });
        $responses = new ResponseFactory();
        $expected = JsonResponder::error(
            $responses->createResponse(),
            401,
            'auth.required',
            'Authentication is required.',
            'correlation-123'
        );
        $handler = new class ($expected) implements RequestHandlerInterface {
            /** @var ResponseInterface */
            private $response;

            public function __construct(ResponseInterface $response)
            {
                $this->response = $response;
            }

            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                return $this->response;
            }
        };
        $request = (new ServerRequestFactory())
            ->createServerRequest('GET', '/api/v1/tasks/42')
            ->withAttribute('correlationId', 'correlation-123');

        $actual = (new ApiExceptionMiddleware($responses, false, $logger))($request, $handler);

        self::assertStringContainsString('Authentication is required.', (string) $actual->getBody());
        self::assertCount(1, $lines);
        $payload = json_decode($lines[0], true);
        self::assertIsArray($payload);
        self::assertSame('auth.required', $payload['error_code']);
        self::assertSame('/api/v1/tasks/{id}', $payload['route']);
        foreach (\LifeHub\Shared\Http\RequestTimings::NAMES as $name) {
            self::assertStringContainsString($name . ';dur=', $actual->getHeaderLine('Server-Timing'));
            self::assertGreaterThanOrEqual(0, $payload['timings_ms'][$name]);
        }
    }

    public function testTimingAlsoCoversThrownErrorsAndUsesOnlyFixedNumericMetrics(): void
    {
        $lines = [];
        $logger = new StructuredLogger(function (string $line) use (&$lines): void {
            $lines[] = $line;
        });
        $handler = new class implements RequestHandlerInterface {
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                $timings = $request->getAttribute(\LifeHub\Shared\Http\RequestTimings::class);
                $timings->sessionOpened(0.01);
                throw new \RuntimeException('secret database credentials');
            }
        };
        $request = (new ServerRequestFactory())->createServerRequest('GET', '/api/v1/tasks?token=secret')
            ->withAttribute('correlationId', 'timing-test-123');
        $middleware = new ApiExceptionMiddleware(new ResponseFactory(), false, $logger, 12.5, 3.0);
        $response = $middleware($request, $handler);
        self::assertSame(500, $response->getStatusCode());
        self::assertStringContainsString('db_connect;dur=12.50', $response->getHeaderLine('Server-Timing'));
        self::assertStringContainsString('bootstrap;dur=3.00', $response->getHeaderLine('Server-Timing'));
        self::assertStringContainsString('session_start;dur=0.01', $response->getHeaderLine('Server-Timing'));
        self::assertStringNotContainsString('secret', $lines[0] . (string) $response->getBody());
        $logged = json_decode($lines[0], true);
        self::assertSame('server.unexpected', $logged['error_code']);
        self::assertSame($logged['duration_ms'], $logged['timings_ms']['app_total']);
        self::assertGreaterThanOrEqual(15.5, $logged['duration_ms']);
        self::assertNull(\LifeHub\Shared\Http\RequestTimings::activate(null));
        foreach (['authentication', 'db_query', 'response_encoding'] as $name) {
            self::assertArrayHasKey($name, $logged['timings_ms']);
            self::assertStringContainsString($name . ';dur=', $response->getHeaderLine('Server-Timing'));
        }
    }
}
