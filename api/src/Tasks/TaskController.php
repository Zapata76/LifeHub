<?php

/**
 * Implements the task API journey with validation, audit, and idempotent completion.
 */

declare(strict_types=1);

namespace LifeHub\Tasks;

use LifeHub\Shared\Audit\AuditLogger;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Http\JsonResponder;
use LifeHub\Shared\Http\RequestData;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class TaskController
{
    /** @var TaskRepository */
    private $tasks;
    /** @var AuditLogger */
    private $audit;

    public function __construct(TaskRepository $tasks, AuditLogger $audit)
    {
        $this->tasks = $tasks;
        $this->audit = $audit;
    }

    public function index(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = $request->getQueryParams();
        $archived = ($query['archived'] ?? '0') === '1';
        $filters = [];
        if (isset($query['status']) && in_array($query['status'], ['open', 'in_progress', 'completed'], true)) {
            $filters['status'] = $query['status'];
        }
        if (isset($query['assignedTo']) && filter_var($query['assignedTo'], FILTER_VALIDATE_INT) !== false) {
            $filters['assignedTo'] = (int) $query['assignedTo'];
        }
        foreach (['dueFrom', 'dueTo'] as $dateFilter) {
            if (isset($query[$dateFilter]) && $this->validDate((string) $query[$dateFilter])) {
                $filters[$dateFilter] = (string) $query[$dateFilter];
            }
        }
        return JsonResponder::write(
            $response,
            ['items' => $this->tasks->list($this->user($request), $archived, $filters)]
        );
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $this->user($request);
        $data = new RequestData($request);
        $priority = $data->optionalString('priority', 16) ?? 'normal';
        if (!in_array($priority, ['low', 'normal', 'high'], true)) {
            throw new ApiException(422, 'task.invalid_priority', 'Unsupported task priority.');
        }
        $dueDate = $data->optionalString('dueDate', 10);
        if ($dueDate !== null && !$this->validDate($dueDate)) {
            throw new ApiException(422, 'task.invalid_due_date', 'dueDate must use YYYY-MM-DD.');
        }
        $id = $this->tasks->create(
            $user,
            $data->requiredString('title', 255),
            $data->optionalString('description', 65535),
            $data->optionalInt('assignedTo'),
            $priority,
            $dueDate
        );
        $this->audit($request, $user, 'task.created', $id);

        return JsonResponder::write($response, ['item' => $this->tasks->get($user, $id)], 201);
    }

    /** @param array<string, string> $args */
    public function update(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        $user = $this->user($request);
        $data = new RequestData($request);
        $values = [];
        foreach (['title', 'description', 'priority', 'status'] as $field) {
            $value = $data->optionalString($field, $field === 'description' ? 65535 : 255);
            if ($value !== null) {
                $values[$field] = $value;
            }
        }
        if ($data->has('assignedTo')) {
            $values['assigned_to'] = $data->optionalInt('assignedTo');
        }
        if ($data->has('dueDate')) {
            $dueDate = $data->optionalString('dueDate', 10);
            if ($dueDate !== null && $dueDate !== '' && !$this->validDate($dueDate)) {
                throw new ApiException(422, 'task.invalid_due_date', 'dueDate must use YYYY-MM-DD.');
            }
            $values['due_date'] = $dueDate === '' ? null : $dueDate;
        }
        $this->validateUpdate($values);
        $this->tasks->update($user, (int) $args['id'], $data->requiredInt('version'), $values);
        $this->audit($request, $user, 'task.updated', (int) $args['id']);
        return JsonResponder::write($response, ['updated' => true]);
    }

    /** @param array<string, string> $args */
    public function complete(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        $user = $this->user($request);
        $changed = $this->tasks->complete(
            $user,
            (int) $args['id'],
            (new RequestData($request))->requiredInt('version')
        );
        if ($changed) {
            $this->audit($request, $user, 'task.completed', (int) $args['id']);
        }

        return JsonResponder::write($response, ['changed' => $changed]);
    }

    /** @param array<string, string> $args */
    public function archive(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        return $this->archiveMutation($request, $response, $args, false);
    }

    /** @param array<string, string> $args */
    public function restore(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        return $this->archiveMutation($request, $response, $args, true);
    }

    /** @param array<string, string> $args */
    private function archiveMutation(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args,
        bool $restore
    ): ResponseInterface {
        $user = $this->user($request);
        $version = (new RequestData($request))->requiredInt('version');
        if ($restore) {
            $this->tasks->restore($user, (int) $args['id'], $version);
        } else {
            $this->tasks->archive($user, (int) $args['id'], $version);
        }
        $this->audit($request, $user, $restore ? 'task.restored' : 'task.archived', (int) $args['id']);

        return JsonResponder::write($response, ['changed' => true]);
    }

    private function user(ServerRequestInterface $request): UserContext
    {
        $user = $request->getAttribute(UserContext::class);
        if (!$user instanceof UserContext) {
            throw new ApiException(401, 'auth.required', 'Authentication is required.');
        }

        return $user;
    }

    private function audit(ServerRequestInterface $request, UserContext $user, string $event, int $id): void
    {
        $this->audit->record(
            $user,
            $event,
            'task',
            $id,
            (string) $request->getAttribute('correlationId', 'unavailable')
        );
    }

    private function validDate(string $date): bool
    {
        $parsed = \DateTimeImmutable::createFromFormat('!Y-m-d', $date);
        return $parsed !== false && $parsed->format('Y-m-d') === $date;
    }

    /** @param array<string, mixed> $values */
    private function validateUpdate(array $values): void
    {
        if ($values === []) {
            throw new ApiException(422, 'validation.empty', 'At least one task field is required.');
        }
        if (isset($values['title']) && trim((string) $values['title']) === '') {
            throw new ApiException(422, 'validation.required', 'Task title cannot be empty.');
        }
        if (isset($values['priority']) && !in_array($values['priority'], ['low', 'normal', 'high'], true)) {
            throw new ApiException(422, 'task.invalid_priority', 'Unsupported task priority.');
        }
        if (isset($values['status']) && !in_array($values['status'], ['open', 'in_progress', 'completed'], true)) {
            throw new ApiException(422, 'task.invalid_status', 'Unsupported task status.');
        }
    }
}
