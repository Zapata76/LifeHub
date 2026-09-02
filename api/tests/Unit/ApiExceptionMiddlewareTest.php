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
    }
}
