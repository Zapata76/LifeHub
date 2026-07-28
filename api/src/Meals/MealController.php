<?php

/** Validates and exposes the household meal-planning aggregate. */

declare(strict_types=1);

namespace LifeHub\Meals;

use DateTimeImmutable;
use LifeHub\Shared\Audit\AuditLogger;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Http\JsonResponder;
use LifeHub\Shared\Http\RequestData;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class MealController
{
    /** @var MealRepository */ private $meals;
    /** @var AuditLogger */ private $audit;
    public function __construct(MealRepository $meals, AuditLogger $audit)
    {
        $this->meals = $meals;
        $this->audit = $audit;
    }

    public function overview(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = $request->getQueryParams();
        $start = $this->date((string) ($query['start'] ?? ''));
        $end = $this->date((string) ($query['end'] ?? ''));
        if ($start > $end || (new DateTimeImmutable($start))->diff(new DateTimeImmutable($end))->days > 31) {
            throw new ApiException(422, 'meal.range_invalid', 'L’intervallo può coprire al massimo 32 giorni.');
        }
        return JsonResponder::write($response, $this->meals->overview($this->user($request), $start, $end));
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $this->user($request);
        $data = new RequestData($request);
        $id = $this->meals->create($user, $this->meal($data), $this->recipeIds($data));
        $this->record($request, $user, 'meal.created', $id);
        return JsonResponder::write($response, ['id' => $id], 201);
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->user($request);
        $data = new RequestData($request);
        $id = (int) $args['id'];
        $this->meals->update($user, $id, $data->requiredInt('version'), $this->meal($data), $this->recipeIds($data));
        $this->record($request, $user, 'meal.updated', $id);
        return JsonResponder::write($response, ['updated' => true]);
    }

    /** @param array<string, string> $args */
    public function delete(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->user($request);
        $data = new RequestData($request);
        $id = (int) $args['id'];
        $this->meals->delete($user, $id, $data->requiredInt('version'));
        $this->record($request, $user, 'meal.deleted', $id);
        return JsonResponder::write($response, ['deleted' => true]);
    }

    public function shoppingPreview(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = new RequestData($request);
        return JsonResponder::write(
            $response,
            $this->meals->shoppingPreview($this->user($request), $this->ids($data, 'mealIds'))
        );
    }

    public function generateShopping(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $key = $request->getHeaderLine('Idempotency-Key');
        if (preg_match('/^[A-Za-z0-9._-]{8,190}$/', $key) !== 1) {
            throw new ApiException(422, 'idempotency.required', 'Idempotency-Key non valido.');
        }
        $user = $this->user($request);
        $data = new RequestData($request);
        $result = $this->meals->generateShopping(
            $user,
            $data->requiredInt('listId'),
            $this->ids($data, 'mealIds'),
            $key
        );
        $this->record($request, $user, 'meal.shopping_generated', null);
        return JsonResponder::write($response, $result, 201);
    }

    /** @return array<string, mixed> */
    private function meal(RequestData $data): array
    {
        $type = $data->requiredString('type', 32);
        if (!in_array($type, ['breakfast', 'lunch', 'dinner'], true)) {
            throw new ApiException(422, 'meal.type_invalid', 'La fascia del pasto non è valida.');
        }
        $servings = $data->optionalInt('servings');
        if ($servings !== null && ($servings < 1 || $servings > 100)) {
            throw new ApiException(422, 'meal.servings_invalid', 'Le porzioni devono essere comprese tra 1 e 100.');
        }
        return [
            'date' => $this->date($data->requiredString('date', 10)), 'type' => $type,
            'description' => $data->optionalString('description', 2000) ?: '',
            'notes' => $data->optionalString('notes', 10000) ?: '', 'servings' => $servings,
        ];
    }

    /** @return list<int> */
    private function recipeIds(RequestData $data): array
    {
        return $this->ids($data, 'recipeIds', true);
    }

    /** @return list<int> */
    private function ids(RequestData $data, string $field, bool $allowEmpty = false): array
    {
        $raw = $data->value($field);
        if (!is_array($raw)) {
            throw new ApiException(422, 'validation.list', $field . ' deve essere una lista.');
        }
        $ids = [];
        foreach ($raw as $value) {
            $id = filter_var($value, FILTER_VALIDATE_INT);
            if ($id === false || (int) $id < 1) {
                throw new ApiException(422, 'validation.positive', $field . ' contiene un ID non valido.');
            }
            $ids[] = (int) $id;
        }
        $ids = array_values(array_unique($ids));
        if (!$allowEmpty && $ids === []) {
            throw new ApiException(422, 'validation.required', 'Seleziona almeno un pasto.');
        }
        if (count($ids) > 100) {
            throw new ApiException(422, 'validation.limit', 'Sono stati selezionati troppi elementi.');
        }
        return $ids;
    }

    private function date(string $value): string
    {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        $errors = DateTimeImmutable::getLastErrors();
        if (
            $date === false
            || ($errors !== false && ($errors['warning_count'] || $errors['error_count']))
            || $date->format('Y-m-d') !== $value
        ) {
            throw new ApiException(422, 'meal.date_invalid', 'La data non è valida.');
        }
        return $value;
    }

    private function user(ServerRequestInterface $request): UserContext
    {
        $user = $request->getAttribute(UserContext::class);
        if (!$user instanceof UserContext) {
            throw new ApiException(401, 'auth.required', 'Autenticazione richiesta.');
        }
        return $user;
    }

    private function record(ServerRequestInterface $request, UserContext $user, string $event, ?int $id): void
    {
        $this->audit->record(
            $user,
            $event,
            'meal',
            $id,
            (string) $request->getAttribute('correlationId', 'unavailable')
        );
    }
}
