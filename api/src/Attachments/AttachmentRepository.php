<?php

/** Persists attachment metadata separately from private file content. */

declare(strict_types=1);

namespace LifeHub\Attachments;

use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use PDO;

final class AttachmentRepository
{
    /** @var PDO */ private $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /** @param array{storageKey:string, mime:string, size:int, sha256:string, originalName:string} $file */
    public function create(UserContext $user, string $ownerType, int $ownerId, array $file): int
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO lh_attachments '
            . '(household_id, owner_type, owner_id, original_name, storage_key, detected_mime, '
            . 'size_bytes, sha256, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([
            $user->householdId(), $ownerType, $ownerId, $file['originalName'], $file['storageKey'],
            $file['mime'], $file['size'], $file['sha256'], $user->id(), gmdate('Y-m-d H:i:s'),
        ]);
        return (int) $this->pdo->lastInsertId();
    }

    /** @return array<string, mixed> */
    public function find(UserContext $user, int $id): array
    {
        $statement = $this->pdo->prepare('SELECT * FROM lh_attachments WHERE household_id = ? AND id = ?');
        $statement->execute([$user->householdId(), $id]);
        $row = $statement->fetch();
        if (!is_array($row)) {
            throw new ApiException(404, 'attachment.not_found', 'Attachment not found.');
        }
        return $row;
    }
}
