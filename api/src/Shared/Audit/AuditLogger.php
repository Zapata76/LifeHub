<?php

/**
 * Records metadata-only security and mutation events in the append-only audit log.
 */

declare(strict_types=1);

namespace LifeHub\Shared\Audit;

use LifeHub\Shared\Auth\UserContext;
use PDO;

final class AuditLogger
{
    /** @var PDO */
    private $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function record(
        UserContext $user,
        string $eventCode,
        string $entityType,
        ?int $entityId,
        string $correlationId
    ): void {
        $statement = $this->pdo->prepare(
            'INSERT INTO lh_audit_log '
            . '(household_id, actor_id, event_code, entity_type, entity_id, correlation_id, occurred_at) '
            . 'VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([
            $user->householdId(),
            $user->id(),
            $eventCode,
            $entityType,
            $entityId,
            $correlationId,
            gmdate('Y-m-d H:i:s'),
        ]);
    }
}
