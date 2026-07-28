<?php

/**
 * Makes multi-record MyISAM operations resumable through durable run and step state.
 */

declare(strict_types=1);

namespace LifeHub\Shared\Persistence;

use LifeHub\Shared\Http\ApiException;
use PDO;
use Throwable;

final class OperationJournal
{
    /** @var PDO */
    private $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * @param callable(int): mixed $operation
     * @return mixed
     */
    public function run(
        int $householdId,
        int $actorId,
        string $type,
        string $idempotencyKey,
        string $inputChecksum,
        callable $operation
    ) {
        $existing = $this->find($householdId, $type, $idempotencyKey);
        if ($existing !== null && (string) $existing['input_checksum'] !== $inputChecksum) {
            throw new ApiException(
                409,
                'idempotency.conflict',
                'The idempotency key was reused with different input.'
            );
        }
        if ($existing !== null && (string) $existing['status'] === 'completed') {
            return ['replayed' => true, 'operationId' => (int) $existing['id']];
        }

        $runId = $existing === null
            ? $this->create($householdId, $actorId, $type, $idempotencyKey, $inputChecksum)
            : (int) $existing['id'];
        $this->markRunning($runId);
        try {
            $result = $operation($runId);
            $this->markCompleted($runId);
            return $result;
        } catch (Throwable $exception) {
            $this->markFailed($runId, 'operation.failed');
            throw $exception;
        }
    }

    /**
     * @param callable(): mixed $operation
     * @return mixed
     */
    public function step(int $runId, string $stepKey, callable $operation)
    {
        $existing = $this->findStep($runId, $stepKey);
        if ($existing !== null && (string) $existing['status'] === 'completed') {
            return null;
        }
        $now = gmdate('Y-m-d H:i:s');
        if ($existing === null) {
            $insert = $this->pdo->prepare(
                'INSERT INTO lh_operation_steps '
                . '(operation_run_id, step_key, status, attempt_count, updated_at) '
                . "VALUES (?, ?, 'running', 1, ?)"
            );
            $insert->execute([$runId, $stepKey, $now]);
        } else {
            $update = $this->pdo->prepare(
                "UPDATE lh_operation_steps SET status = 'running', attempt_count = attempt_count + 1, "
                . 'updated_at = ? WHERE id = ?'
            );
            $update->execute([$now, $existing['id']]);
        }
        try {
            $result = $operation();
            $checksum = hash('sha256', json_encode($result, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
            $complete = $this->pdo->prepare(
                "UPDATE lh_operation_steps SET status = 'completed', output_checksum = ?, updated_at = ? "
                . 'WHERE operation_run_id = ? AND step_key = ?'
            );
            $complete->execute([$checksum, gmdate('Y-m-d H:i:s'), $runId, $stepKey]);
            return $result;
        } catch (Throwable $exception) {
            $failed = $this->pdo->prepare(
                "UPDATE lh_operation_steps SET status = 'failed', last_error_code = ?, updated_at = ? "
                . 'WHERE operation_run_id = ? AND step_key = ?'
            );
            $failed->execute(['step.failed', gmdate('Y-m-d H:i:s'), $runId, $stepKey]);
            throw $exception;
        }
    }

    /** @return array<string, mixed>|null */
    private function find(int $householdId, string $type, string $key): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT * FROM lh_operation_runs WHERE household_id = ? AND operation_type = ? AND idempotency_key = ?'
        );
        $statement->execute([$householdId, $type, $key]);
        $row = $statement->fetch();
        return is_array($row) ? $row : null;
    }

    private function create(int $householdId, int $actorId, string $type, string $key, string $checksum): int
    {
        $now = gmdate('Y-m-d H:i:s');
        $statement = $this->pdo->prepare(
            'INSERT INTO lh_operation_runs '
            . '(household_id, operation_type, idempotency_key, input_checksum, status, '
            . 'created_by, created_at, updated_at) '
            . "VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)"
        );
        $statement->execute([$householdId, $type, $key, $checksum, $actorId, $now, $now]);
        return (int) $this->pdo->lastInsertId();
    }

    /** @return array<string, mixed>|null */
    private function findStep(int $runId, string $stepKey): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT * FROM lh_operation_steps WHERE operation_run_id = ? AND step_key = ?'
        );
        $statement->execute([$runId, $stepKey]);
        $row = $statement->fetch();
        return is_array($row) ? $row : null;
    }

    private function markRunning(int $id): void
    {
        $statement = $this->pdo->prepare(
            "UPDATE lh_operation_runs SET status = 'running', attempt_count = attempt_count + 1, "
            . 'updated_at = ? WHERE id = ?'
        );
        $statement->execute([gmdate('Y-m-d H:i:s'), $id]);
    }

    private function markCompleted(int $id): void
    {
        $now = gmdate('Y-m-d H:i:s');
        $statement = $this->pdo->prepare(
            "UPDATE lh_operation_runs SET status = 'completed', updated_at = ?, completed_at = ? WHERE id = ?"
        );
        $statement->execute([$now, $now, $id]);
    }

    private function markFailed(int $id, string $code): void
    {
        $statement = $this->pdo->prepare(
            "UPDATE lh_operation_runs SET status = 'failed', last_error_code = ?, updated_at = ? WHERE id = ?"
        );
        $statement->execute([$code, gmdate('Y-m-d H:i:s'), $id]);
    }
}
