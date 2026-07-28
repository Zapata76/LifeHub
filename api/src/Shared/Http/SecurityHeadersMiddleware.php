<?php

/**
 * Adds browser hardening headers to API responses without weakening same-origin sessions.
 */

declare(strict_types=1);

namespace LifeHub\Shared\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class SecurityHeadersMiddleware
{
    public function __invoke(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        return $handler->handle($request)
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('Referrer-Policy', 'same-origin')
            ->withHeader('X-Frame-Options', 'SAMEORIGIN')
            ->withHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
            ->withHeader(
                'Content-Security-Policy',
                "default-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'"
            );
    }
}
