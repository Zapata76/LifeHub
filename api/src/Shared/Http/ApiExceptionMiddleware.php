<?php

/**
 * Converts expected failures into the canonical JSON envelope without leaking details.
 */

declare(strict_types=1);

namespace LifeHub\Shared\Http;

use LifeHub\Shared\Logging\StructuredLogger;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Exception\HttpNotFoundException;
use Slim\Psr7\Factory\ResponseFactory;
use Throwable;

final class ApiExceptionMiddleware
{
    /** @var ResponseFactory */
    private $responseFactory;
    /** @var bool */
    private $debug;
    /** @var StructuredLogger */
    private $logger;

    public function __construct(ResponseFactory $responseFactory, bool $debug, ?StructuredLogger $logger = null)
    {
        $this->responseFactory = $responseFactory;
        $this->debug = $debug;
        $this->logger = $logger ?? new StructuredLogger();
    }

    public function __invoke(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $startedAt = hrtime(true);
        try {
            $response = $handler->handle($request);
            $this->log(
                $request,
                $startedAt,
                $response->getStatusCode(),
                $this->responseErrorCode($response)
            );
            return $response;
        } catch (ApiException $exception) {
            $response = JsonResponder::error(
                $this->responseFactory->createResponse(),
                $exception->status(),
                $exception->apiCode(),
                $exception->getMessage(),
                (string) $request->getAttribute('correlationId', 'unavailable')
            );
            $this->log($request, $startedAt, $exception->status(), $exception->apiCode());
            return $response;
        } catch (HttpNotFoundException $exception) {
            $response = JsonResponder::error(
                $this->responseFactory->createResponse(),
                404,
                'http.not_found',
                'Not found.',
                (string) $request->getAttribute('correlationId', 'unavailable')
            );
            $this->log($request, $startedAt, 404, 'http.not_found');
            return $response;
        } catch (Throwable $exception) {
            $message = $this->debug ? $exception->getMessage() : 'An unexpected error occurred.';
            $response = JsonResponder::error(
                $this->responseFactory->createResponse(),
                500,
                'server.unexpected',
                $message,
                (string) $request->getAttribute('correlationId', 'unavailable')
            );
            $this->log($request, $startedAt, 500, 'server.unexpected');
            return $response;
        }
    }

    private function responseErrorCode(ResponseInterface $response): ?string
    {
        $status = $response->getStatusCode();
        if ($status < 400) {
            return null;
        }
        $fallback = 'http.status_' . $status;
        if (stripos($response->getHeaderLine('Content-Type'), 'application/json') === false) {
            return $fallback;
        }
        $body = $response->getBody();
        if (!$body->isSeekable()) {
            return $fallback;
        }
        try {
            $position = $body->tell();
            $body->rewind();
            $payload = json_decode($body->getContents(), true);
            $body->seek($position);
        } catch (Throwable) {
            return $fallback;
        }
        $error = is_array($payload) ? ($payload['error'] ?? null) : null;
        $code = is_array($error) ? ($error['code'] ?? null) : null;
        return is_string($code) && $code !== '' ? $code : $fallback;
    }

    private function log(
        ServerRequestInterface $request,
        int $startedAt,
        int $status,
        ?string $errorCode
    ): void {
        $path = $request->getUri()->getPath();
        $route = preg_replace('#/[0-9]+(?=/|$)#', '/{id}', $path) ?? $path;
        $this->logger->httpRequest(
            (string) $request->getAttribute('correlationId', 'unavailable'),
            $request->getMethod(),
            $route,
            $status,
            (hrtime(true) - $startedAt) / 1000000,
            $errorCode
        );
    }
}
