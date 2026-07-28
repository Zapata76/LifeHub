<?php

/**
 * Writes canonical UTF-8 JSON responses and stable error envelopes.
 */

declare(strict_types=1);

namespace LifeHub\Shared\Http;

use JsonException;
use Psr\Http\Message\ResponseInterface;

final class JsonResponder
{
    /**
     * @param mixed $payload
     * @throws JsonException
     */
    public static function write(ResponseInterface $response, $payload, int $status = 200): ResponseInterface
    {
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $response->getBody()->write($json);

        return $response
            ->withStatus($status)
            ->withHeader('Content-Type', 'application/json; charset=utf-8')
            ->withHeader('Cache-Control', 'no-store');
    }

    public static function error(
        ResponseInterface $response,
        int $status,
        string $code,
        string $message,
        string $correlationId
    ): ResponseInterface {
        return self::write($response, [
            'error' => [
                'code' => $code,
                'message' => $message,
                'correlationId' => $correlationId,
            ],
        ], $status);
    }
}
