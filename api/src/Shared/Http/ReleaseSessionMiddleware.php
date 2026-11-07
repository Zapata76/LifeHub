<?php

/** Saves session changes after authentication/CSRF, before protected application work or streaming. */

declare(strict_types=1);

namespace LifeHub\Shared\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class ReleaseSessionMiddleware
{
    public function __invoke(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        SessionMiddleware::close();
        return $handler->handle($request);
    }
}
