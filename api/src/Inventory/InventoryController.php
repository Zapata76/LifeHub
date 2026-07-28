<?php

/**
 * Validates and exposes household inventory aggregate commands.
 */

declare(strict_types=1);

namespace LifeHub\Inventory;

use LifeHub\Shared\Audit\AuditLogger;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Http\JsonResponder;
use LifeHub\Shared\Http\RequestData;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class InventoryController
{
    /** @var InventoryRepository */ private $inventory;
    /** @var AuditLogger */ private $audit;

    public function __construct(InventoryRepository $inventory, AuditLogger $audit)
    {
        $this->inventory = $inventory;
        $this->audit = $audit;
    }

    public function overview(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return JsonResponder::write($response, $this->inventory->overview($this->user($request)));
    }

    /** @param array<string, string> $args */
    public function detail(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $item = $this->inventory->detail($this->user($request), (int) $args['id']);
        return JsonResponder::write($response, ['item' => $item]);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $this->user($request);
        $id = $this->inventory->create($user, $this->item(new RequestData($request)));
        $this->record($request, $user, 'inventory.created', $id);
        return JsonResponder::write($response, ['id' => $id], 201);
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->user($request);
        $data = new RequestData($request);
        $id = (int) $args['id'];
        $this->inventory->update($user, $id, $data->requiredInt('version'), $this->item($data));
        $this->record($request, $user, 'inventory.updated', $id);
        return JsonResponder::write($response, ['updated' => true]);
    }

    /** @param array<string, string> $args */
    public function archive(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        $user = $this->user($request);
        $id = (int) $args['id'];
        $this->inventory->archive($user, $id, (new RequestData($request))->requiredInt('version'));
        $this->record($request, $user, 'inventory.archived', $id);
        return JsonResponder::write($response, ['archived' => true]);
    }

    /** @param array<string, string> $args */
    public function removeImage(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        $user = $this->user($request);
        $id = (int) $args['id'];
        $this->inventory->removeImage($user, $id);
        $this->record($request, $user, 'inventory.image_removed', $id);
        return JsonResponder::write($response, ['removed' => true]);
    }

    /** @return array<string, mixed> */
    private function item(RequestData $data): array
    {
        $quantity = $this->quantity($data->value('quantity'));
        $unit = $data->optionalString('unit', 32) ?: null;
        if ($quantity === null) {
            $unit = null;
        }
        return [
            'name' => $data->requiredString('name', 255),
            'category' => $data->optionalString('category', 100) ?: 'Altro',
            'location' => $data->optionalString('location', 500) ?: '',
            'ownerId' => $this->positiveOrNull($data->optionalInt('ownerId'), 'ownerId'),
            'documentId' => $this->positiveOrNull($data->optionalInt('documentId'), 'documentId'),
            'quantity' => $quantity,
            'unit' => $unit,
            'purchaseDate' => $this->dateOrNull($data->optionalString('purchaseDate', 10), 'purchaseDate'),
            'warrantyExpiry' => $this->dateOrNull(
                $data->optionalString('warrantyExpiry', 10),
                'warrantyExpiry'
            ),
            'notes' => $data->optionalString('notes', 20000) ?: '',
        ];
    }

    /** @param mixed $value */
    private function quantity($value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (!is_numeric($value) || (float) $value < 0) {
            throw new ApiException(422, 'inventory.quantity_invalid', 'Quantity must be zero or positive.');
        }
        return (float) $value;
    }

    private function dateOrNull(?string $value, string $field): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $parts = explode('-', $value);
        if (count($parts) !== 3 || !checkdate((int) $parts[1], (int) $parts[2], (int) $parts[0])) {
            throw new ApiException(422, 'validation.date', $field . ' must be a valid ISO date.');
        }
        return $value;
    }

    private function positiveOrNull(?int $value, string $field): ?int
    {
        if ($value !== null && $value < 1) {
            throw new ApiException(422, 'validation.positive', $field . ' must be positive.');
        }
        return $value;
    }

    private function user(ServerRequestInterface $request): UserContext
    {
        $user = $request->getAttribute(UserContext::class);
        if (!$user instanceof UserContext) {
            throw new ApiException(401, 'auth.required', 'Authentication is required.');
        }
        return $user;
    }

    private function record(ServerRequestInterface $request, UserContext $user, string $event, int $id): void
    {
        $this->audit->record(
            $user,
            $event,
            'inventory',
            $id,
            (string) $request->getAttribute('correlationId', 'unavailable')
        );
    }
}
