<?php

/**
 * Provides one validated CRUD contract for fixed modular-monolith resources.
 */

declare(strict_types=1);

namespace LifeHub\Shared\Crud;

use LifeHub\Shared\Audit\AuditLogger;
use LifeHub\Shared\Auth\Authorization;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Http\JsonResponder;
use LifeHub\Shared\Http\RequestData;
use LifeHub\Shared\Text\SearchKey;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class ResourceController
{
    /** @var ResourceDefinition */ private $definition;
    /** @var ResourceRepository */ private $repository;
    /** @var AuditLogger */ private $audit;

    public function __construct(ResourceDefinition $definition, ResourceRepository $repository, AuditLogger $audit)
    {
        $this->definition = $definition;
        $this->repository = $repository;
        $this->audit = $audit;
    }

    public function index(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $this->user($request, false);
        $items = $this->repository->list($user);
        if ($user->role() === 'child' && $this->definition->entity() === 'calendar') {
            foreach ($items as &$item) {
                unset($item['external_id']);
            }
            unset($item);
        }
        return JsonResponder::write($response, ['items' => $items]);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $this->user($request, true);
        $values = $this->values(new RequestData($request), true);
        $id = $this->repository->create($user, $values);
        $this->record($request, $user, 'created', $id);
        return JsonResponder::write($response, ['item' => $this->repository->find($user, $id)], 201);
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->user($request, true);
        $data = new RequestData($request);
        $this->repository->update(
            $user,
            (int) $args['id'],
            $data->requiredInt('version'),
            $this->values($data, false)
        );
        $this->record($request, $user, 'updated', (int) $args['id']);
        return JsonResponder::write($response, ['updated' => true]);
    }

    /** @param array<string, string> $args */
    public function delete(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        $user = $this->user($request, true);
        $id = (int) $args['id'];
        $this->repository->deleteCalendar(
            $user,
            $id,
            (new RequestData($request))->requiredInt('version')
        );
        $this->record($request, $user, 'deleted', $id);
        return JsonResponder::write($response, ['deleted' => true]);
    }

    /** @return array<string, mixed> */
    private function values(RequestData $data, bool $creating): array
    {
        $values = $creating ? $this->definition->defaults() : [];
        foreach ($this->definition->fields() as $field) {
            $value = $data->value($field);
            if ($value !== null) {
                $stringLimit = $this->definition->stringLimit($field);
                if ($stringLimit !== null) {
                    if (!is_string($value)) {
                        throw new ApiException(422, 'validation.string', sprintf('%s must be a string.', $field));
                    }
                    $value = trim($value);
                    if (mb_strlen($value, 'UTF-8') > $stringLimit) {
                        throw new ApiException(422, 'validation.length', sprintf('%s is too long.', $field));
                    }
                } elseif (!is_scalar($value)) {
                    throw new ApiException(422, 'validation.scalar', sprintf('%s must be scalar.', $field));
                }
                $values[$field] = $value;
            }
        }
        if ($creating) {
            foreach ($this->definition->required() as $required) {
                if (!isset($values[$required]) || $values[$required] === '') {
                    throw new ApiException(422, 'validation.required', sprintf('%s is required.', $required));
                }
            }
        }
        $source = $this->definition->searchSource();
        $target = $this->definition->searchTarget();
        if ($source !== null && $target !== null && isset($values[$source])) {
            $values[$target] = SearchKey::from((string) $values[$source], 255);
        }
        if ($values === []) {
            throw new ApiException(422, 'validation.empty', 'At least one writable field is required.');
        }

        return $values;
    }

    private function user(ServerRequestInterface $request, bool $write): UserContext
    {
        $user = $request->getAttribute(UserContext::class);
        if (!$user instanceof UserContext) {
            throw new ApiException(401, 'auth.required', 'Authentication is required.');
        }
        if ($write && !Authorization::canManageHousehold($user)) {
            throw new ApiException(403, 'authorization.denied', 'This role cannot modify the resource.');
        }

        return $user;
    }

    private function record(ServerRequestInterface $request, UserContext $user, string $action, int $id): void
    {
        $this->audit->record(
            $user,
            $this->definition->entity() . '.' . $action,
            $this->definition->entity(),
            $id,
            (string) $request->getAttribute('correlationId', 'unavailable')
        );
    }
}
