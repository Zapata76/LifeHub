<?php

/**
 * Enforces a session-bound CSRF token on every unsafe HTTP method.
 */

declare(strict_types=1);

namespace LifeHub\Shared\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Factory\ResponseFactory;

final class CsrfMiddleware
{
    /** @var ResponseFactory */
    private $responseFactory;

    public function __construct(ResponseFactory $responseFactory)
    {
        $this->responseFactory = $responseFactory;
    }

    public function __invoke(
        ServerRequestInterface $request,
        RequestHandlerInterface $handler
    ): ResponseInterface {
        if (!isset($_SESSION['csrfToken'])) {
            $_SESSION['csrfToken'] = bin2hex(random_bytes(32));
        }

        if (
            in_array(strtoupper($request->getMethod()), ['POST', 'PUT', 'PATCH', 'DELETE'], true)
            && !$this->isLogoutRequest($request)
        ) {
            $provided = $request->getHeaderLine('X-CSRF-Token');
            if ($provided === '' || !hash_equals((string) $_SESSION['csrfToken'], $provided)) {
                $correlationId = (string) $request->getAttribute('correlationId', 'unavailable');
                return JsonResponder::error(
                    $this->responseFactory->createResponse(),
                    403,
                    'csrf.invalid',
                    'Invalid or missing CSRF token.',
                    $correlationId
                );
            }
        }

        return $handler->handle($request);
    }

    private function isLogoutRequest(ServerRequestInterface $request): bool
    {
        return preg_match('#(?:^|/)v1/auth/logout/?$#', $request->getUri()->getPath()) === 1;
    }
}
