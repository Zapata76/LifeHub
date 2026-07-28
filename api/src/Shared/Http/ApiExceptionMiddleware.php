<?php

/**
 * Converts expected failures into the canonical JSON envelope without leaking details.
 */

declare(strict_types=1);

namespace LifeHub\Shared\Http;

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

    public function __construct(ResponseFactory $responseFactory, bool $debug)
    {
        $this->responseFactory = $responseFactory;
        $this->debug = $debug;
    }

    public function __invoke(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        try {
            return $handler->handle($request);
        } catch (ApiException $exception) {
            return JsonResponder::error(
                $this->responseFactory->createResponse(),
                $exception->status(),
                $exception->apiCode(),
                $exception->getMessage(),
                (string) $request->getAttribute('correlationId', 'unavailable')
            );
        } catch (HttpNotFoundException $exception) {
            return JsonResponder::error(
                $this->responseFactory->createResponse(),
                404,
                'http.not_found',
                'Not found.',
                (string) $request->getAttribute('correlationId', 'unavailable')
            );
        } catch (Throwable $exception) {
            $message = $this->debug ? $exception->getMessage() : 'An unexpected error occurred.';
            return JsonResponder::error(
                $this->responseFactory->createResponse(),
                500,
                'server.unexpected',
                $message,
                (string) $request->getAttribute('correlationId', 'unavailable')
            );
        }
    }
}
