<?php

/**
 * Exposes idempotent shopping generation to authenticated household managers.
 */

declare(strict_types=1);

namespace LifeHub\Shopping;

use LifeHub\Shared\Auth\Authorization;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Http\JsonResponder;
use LifeHub\Shared\Http\RequestData;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class ShoppingController
{
    /** @var ShoppingGenerator */ private $generator;

    public function __construct(ShoppingGenerator $generator)
    {
        $this->generator = $generator;
    }

    public function generate(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $request->getAttribute(UserContext::class);
        if (!$user instanceof UserContext || !Authorization::canManageHousehold($user)) {
            throw new ApiException(403, 'authorization.denied', 'This role cannot generate shopping items.');
        }
        $key = $request->getHeaderLine('Idempotency-Key');
        if (preg_match('/^[A-Za-z0-9._-]{8,190}$/', $key) !== 1) {
            throw new ApiException(422, 'idempotency.required', 'A valid Idempotency-Key header is required.');
        }
        $data = new RequestData($request);
        $result = $this->generator->generate(
            $user,
            $data->requiredInt('listId'),
            $data->optionalInt('recipeId'),
            $data->optionalInt('mealId'),
            $key
        );
        return JsonResponder::write($response, $result, 201);
    }
}
