<?php

/**
 * Validates goal aggregates, progress trackers, and daily progress logs.
 */

declare(strict_types=1);

namespace LifeHub\Goals;

use LifeHub\Attachments\StorageGateway;
use LifeHub\Shared\Audit\AuditLogger;
use LifeHub\Shared\Auth\Authorization;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Http\JsonResponder;
use LifeHub\Shared\Http\RequestData;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class GoalController
{
    /** @var GoalRepository */ private $goals;
    /** @var AuditLogger */ private $audit;
    /** @var StorageGateway */ private $storage;

    public function __construct(GoalRepository $goals, AuditLogger $audit, StorageGateway $storage)
    {
        $this->goals = $goals;
        $this->audit = $audit;
        $this->storage = $storage;
    }

    public function overview(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return JsonResponder::write($response, $this->goals->overview($this->user($request)));
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $this->manager($request);
        $data = new RequestData($request);
        $goal = $this->goal($data);
        $id = $this->goals->create($user, $goal, $this->trackers($data));
        $this->record($request, $user, 'goal.created', $id);
        return JsonResponder::write($response, ['id' => $id], 201);
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->manager($request);
        $data = new RequestData($request);
        $id = (int) $args['id'];
        $this->goals->update(
            $user,
            $id,
            $data->requiredInt('version'),
            $this->goal($data),
            $this->trackers($data)
        );
        $this->record($request, $user, 'goal.updated', $id);
        return JsonResponder::write($response, ['updated' => true]);
    }

    /** @param array<string, string> $args */
    public function delete(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->manager($request);
        $id = (int) $args['id'];
        $keys = $this->goals->delete($user, $id, (new RequestData($request))->requiredInt('version'));
        foreach ($keys as $key) {
            $this->storage->discard($key);
        }
        $this->record($request, $user, 'goal.deleted', $id);
        return JsonResponder::write($response, ['deleted' => true]);
    }

    /** @param array<string, string> $args */
    public function log(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->user($request);
        $data = new RequestData($request);
        $trackerId = (int) $args['trackerId'];
        $date = $this->date($data->optionalString('date', 10), 'date') ?: gmdate('Y-m-d');
        $value = $data->value('value');
        if (!is_bool($value) && !is_int($value) && !is_float($value) && !is_string($value)) {
            throw new ApiException(422, 'goal.value_invalid', 'Progress value must be numeric or boolean.');
        }
        $this->goals->saveLog(
            $user,
            $trackerId,
            $date,
            $value,
            $data->optionalString('note', 2000) ?: ''
        );
        $this->record($request, $user, 'goal.progress_logged', $trackerId);
        return JsonResponder::write($response, ['saved' => true]);
    }

    /** @return array<string, mixed> */
    private function goal(RequestData $data): array
    {
        $start = $this->date($data->optionalString('startDate', 10), 'startDate');
        $end = $this->date($data->optionalString('endDate', 10), 'endDate');
        if ($start !== null && $end !== null && $end < $start) {
            throw new ApiException(422, 'goal.date_order', 'End date cannot precede start date.');
        }
        $status = $data->optionalString('status', 24) ?: 'active';
        if (!in_array($status, ['active', 'completed', 'suspended'], true)) {
            throw new ApiException(422, 'goal.status_invalid', 'Goal status is invalid.');
        }
        return [
            'title' => $data->requiredString('title', 255),
            'description' => $data->optionalString('description', 20000) ?: '',
            'startDate' => $start,
            'endDate' => $end,
            'ownerId' => $data->requiredInt('ownerId'),
            'status' => $status,
        ];
    }

    /** @return list<array<string, mixed>> */
    private function trackers(RequestData $data): array
    {
        $raw = $data->value('trackers');
        if (!is_array($raw)) {
            throw new ApiException(422, 'goal.trackers_invalid', 'Trackers must be a list.');
        }
        if (count($raw) > 12) {
            throw new ApiException(422, 'goal.trackers_limit', 'A goal can contain at most 12 trackers.');
        }
        $trackers = [];
        foreach ($raw as $row) {
            if (!is_array($row)) {
                throw new ApiException(422, 'goal.tracker_invalid', 'Each tracker must be an object.');
            }
            $type = (string) ($row['type'] ?? '');
            if ($type === 'numeric') {
                $type = 'quantity';
            }
            $frequency = (string) ($row['frequency'] ?? '');
            if (!in_array($type, ['boolean', 'quantity', 'percentage'], true)) {
                throw new ApiException(422, 'goal.tracker_type_invalid', 'Tracker type is invalid.');
            }
            if (!in_array($frequency, ['daily', 'weekly'], true)) {
                throw new ApiException(422, 'goal.tracker_frequency_invalid', 'Tracker frequency is invalid.');
            }
            $id = filter_var($row['id'] ?? null, FILTER_VALIDATE_INT);
            $trackers[] = [
                'id' => $id === false || (int) $id < 1 ? null : (int) $id,
                'type' => $type,
                'frequency' => $frequency,
            ];
        }
        return $trackers;
    }

    private function date(?string $value, string $field): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (
            preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $value, $matches) !== 1
            || !checkdate((int) $matches[2], (int) $matches[3], (int) $matches[1])
        ) {
            throw new ApiException(422, 'goal.date_invalid', $field . ' must be a valid ISO date.');
        }
        return $value;
    }

    private function manager(ServerRequestInterface $request): UserContext
    {
        $user = $this->user($request);
        if (!Authorization::canManageHousehold($user)) {
            throw new ApiException(403, 'authorization.denied', 'This role cannot manage goals.');
        }
        return $user;
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
            'goal',
            $id,
            (string) $request->getAttribute('correlationId', 'unavailable')
        );
    }
}
