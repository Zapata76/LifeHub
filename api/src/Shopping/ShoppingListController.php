<?php

/**
 * Validates and exposes low-friction shopping-list commands for household users.
 * Catalog administration and recipe generation remain separate concerns.
 */

declare(strict_types=1);

namespace LifeHub\Shopping;

use LifeHub\Attachments\StorageGateway;
use LifeHub\Shared\Audit\AuditLogger;
use LifeHub\Shared\Auth\Authorization;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Http\JsonResponder;
use LifeHub\Shared\Http\RequestData;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class ShoppingListController
{
    /** @var ShoppingRepository */ private $shopping;
    /** @var AuditLogger */ private $audit;
    /** @var StorageGateway */ private $storage;

    public function __construct(ShoppingRepository $shopping, AuditLogger $audit, StorageGateway $storage)
    {
        $this->shopping = $shopping;
        $this->audit = $audit;
        $this->storage = $storage;
    }

    public function overview(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return JsonResponder::write($response, $this->shopping->overview($this->user($request)));
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $this->user($request);
        $data = new RequestData($request);
        $quantity = $data->requiredString('quantity', 80);
        $id = $this->shopping->create(
            $user,
            $data->requiredInt('listId'),
            $data->requiredInt('productId'),
            $this->positiveOrNull($data->optionalInt('supermarketId'), 'supermarketId'),
            $quantity
        );
        $this->record($request, $user, 'shopping_item.created', $id);
        return JsonResponder::write($response, ['id' => $id], 201);
    }

    /** @param array<string, string> $args */
    public function update(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        $user = $this->user($request);
        $data = new RequestData($request);
        $checked = $data->optionalBool('checked');
        if ($checked === null) {
            throw new ApiException(422, 'validation.required', 'checked is required.');
        }
        $quantity = $data->optionalString('quantity', 80);
        if ($quantity === '') {
            throw new ApiException(422, 'shopping.quantity_required', 'Quantity cannot be empty.');
        }
        $id = (int) $args['id'];
        $this->shopping->update(
            $user,
            $id,
            $data->requiredInt('version'),
            $checked,
            $quantity,
            $this->positiveOrNull($data->optionalInt('supermarketId'), 'supermarketId')
        );
        $this->record($request, $user, 'shopping_item.updated', $id);
        return JsonResponder::write($response, ['updated' => true]);
    }

    /** @param array<string, string> $args */
    public function remove(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        $user = $this->user($request);
        $id = (int) $args['id'];
        $this->shopping->remove($user, $id, (new RequestData($request))->requiredInt('version'));
        $this->record($request, $user, 'shopping_item.removed', $id);
        return JsonResponder::write($response, ['removed' => true]);
    }

    public function clearChecked(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $this->user($request);
        $listId = (new RequestData($request))->requiredInt('listId');
        $removed = $this->shopping->clearChecked($user, $listId);
        $this->record($request, $user, 'shopping_items.cleared', $listId);
        return JsonResponder::write($response, ['removed' => $removed]);
    }

    /** @param array<string, string> $args */
    public function deleteCatalog(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        $user = $this->user($request);
        if (!Authorization::canManageHousehold($user)) {
            throw new ApiException(403, 'authorization.denied', 'This role cannot delete catalogue resources.');
        }
        $resource = (string) $args['resource'];
        $id = (int) $args['id'];
        $keys = $this->shopping->deleteCatalog(
            $user,
            $resource,
            $id,
            (new RequestData($request))->requiredInt('version')
        );
        foreach ($keys as $key) {
            $this->storage->discard($key);
        }
        $entities = [
            'categories' => 'category',
            'supermarkets' => 'supermarket',
            'products' => 'product',
            'prices' => 'price',
        ];
        $entity = $entities[$resource];
        $this->audit->record(
            $user,
            $entity . '.deleted',
            $entity,
            $id,
            (string) $request->getAttribute('correlationId', 'unavailable')
        );
        return JsonResponder::write($response, ['deleted' => true]);
    }

    private function user(ServerRequestInterface $request): UserContext
    {
        $user = $request->getAttribute(UserContext::class);
        if (!$user instanceof UserContext) {
            throw new ApiException(401, 'auth.required', 'Authentication is required.');
        }
        return $user;
    }

    private function positiveOrNull(?int $value, string $field): ?int
    {
        if ($value !== null && $value < 1) {
            throw new ApiException(422, 'validation.positive', $field . ' must be positive.');
        }
        return $value;
    }

    private function record(ServerRequestInterface $request, UserContext $user, string $event, int $id): void
    {
        $this->audit->record(
            $user,
            $event,
            'shopping_item',
            $id,
            (string) $request->getAttribute('correlationId', 'unavailable')
        );
    }
}
