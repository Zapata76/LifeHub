<?php

/** Bridges test fixtures' in-memory session edits to independent HTTP request lifetimes. */

declare(strict_types=1);

namespace LifeHub\Tests\Support;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class SyntheticSessionMiddleware
{
    public function __invoke(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $state = $_SESSION ?? [];
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
        $_SESSION = $state;
        return $handler->handle($request);
    }
}
