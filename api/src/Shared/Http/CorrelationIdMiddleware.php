<?php

/**
 * Attaches a safe correlation identifier to every request and response.
 */

declare(strict_types=1);

namespace LifeHub\Shared\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class CorrelationIdMiddleware
{
    public function __invoke(
        ServerRequestInterface $request,
        RequestHandlerInterface $handler
    ): ResponseInterface {
        $candidate = trim($request->getHeaderLine('X-Correlation-ID'));
        $correlationId = preg_match('/^[A-Za-z0-9._-]{8,64}$/', $candidate) === 1
            ? $candidate
            : bin2hex(random_bytes(16));

        $response = $handler->handle($request->withAttribute('correlationId', $correlationId));
        return $response->withHeader('X-Correlation-ID', $correlationId);
    }
}
