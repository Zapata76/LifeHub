<?php

/** Reads and persists the private document archive. */

declare(strict_types=1);

namespace LifeHub\Documents;

use LifeHub\Shared\Auth\Authorization;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use PDO;
use PDOStatement;
use Throwable;

final class DocumentRepository
{
    /** @var PDO */ private $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /** @return array<string, mixed> */
    public function overview(UserContext $user): array
    {
        $this->assertManager($user);
        $documents = $this->documents($user);
        $categories = [];
        foreach ($documents as $document) {
            $category = trim((string) ($document['category_text'] ?? ''));
            if ($category !== '') {
                $categories[$this->searchKey($category)] = $category;
            }
        }
        natcasesort($categories);
        return ['documents' => $documents, 'categories' => array_values($categories), 'can_manage' => true];
    }

    /** @return array<string, mixed> */
    public function detail(UserContext $user, int $id): array
    {
        $this->assertManager($user);
        foreach ($this->documents($user, $id) as $document) {
            return $document;
        }
        throw new ApiException(404, 'document.not_found', 'Document not found.');
    }

    /**
     * @param array<string, string> $document
     * @param array{storageKey:string,mime:string,size:int,sha256:string,originalName:string} $file
     */
    public function create(UserContext $user, array $document, array $file): int
    {
        $this->assertManager($user);
        $now = gmdate('Y-m-d H:i:s');
        $statement = $this->pdo->prepare(
            'INSERT INTO lh_documents (household_id, title, title_search, description, category_text, '
            . 'visibility, owner_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([
            $user->householdId(), $document['title'], $this->searchKey($document['title']), $document['notes'],
            $document['category'], 'private', $user->id(), $user->id(), $now, $now,
        ]);
        $id = (int) $this->pdo->lastInsertId();
        try {
            $this->insertAttachment($user, $id, $file, $now);
        } catch (Throwable $exception) {
            $cleanup = $this->pdo->prepare('DELETE FROM lh_documents WHERE household_id = ? AND id = ?');
            $cleanup->execute([$user->householdId(), $id]);
            throw $exception;
        }
        return $id;
    }

    /**
     * @param array<string, string> $document
     * @param array{storageKey:string,mime:string,size:int,sha256:string,originalName:string}|null $file
     * @return list<string> old storage keys that can be removed after a successful replacement
     */
    public function update(UserContext $user, int $id, int $version, array $document, ?array $file): array
    {
        $this->assertManager($user);
        $this->detail($user, $id);
        $newAttachmentId = null;
        if ($file !== null) {
            $newAttachmentId = $this->insertAttachment($user, $id, $file, gmdate('Y-m-d H:i:s'));
        }
        $statement = $this->pdo->prepare(
            'UPDATE lh_documents SET title = ?, title_search = ?, description = ?, category_text = ?, '
            . 'updated_at = ?, version = version + 1 WHERE household_id = ? AND id = ? AND version = ? '
            . 'AND archived_at IS NULL'
        );
        $statement->execute([
            $document['title'], $this->searchKey($document['title']), $document['notes'], $document['category'],
            gmdate('Y-m-d H:i:s'), $user->householdId(), $id, $version,
        ]);
        if ($statement->rowCount() !== 1) {
            if ($newAttachmentId !== null) {
                $cleanup = $this->pdo->prepare('DELETE FROM lh_attachments WHERE household_id = ? AND id = ?');
                $cleanup->execute([$user->householdId(), $newAttachmentId]);
            }
            throw new ApiException(409, 'version.conflict', 'The document changed; reload and retry.');
        }
        if ($newAttachmentId === null) {
            return [];
        }
        $old = $this->rows(
            "SELECT storage_key FROM lh_attachments WHERE household_id = ? AND owner_type = 'document' "
            . 'AND owner_id = ? AND id <> ?',
            [$user->householdId(), $id, $newAttachmentId]
        );
        $delete = $this->pdo->prepare(
            "DELETE FROM lh_attachments WHERE household_id = ? AND owner_type = 'document' AND owner_id = ? "
            . 'AND id <> ?'
        );
        $delete->execute([$user->householdId(), $id, $newAttachmentId]);
        return array_values(array_map(function (array $row): string {
            return (string) $row['storage_key'];
        }, $old));
    }

    /** @return list<string> */
    public function delete(UserContext $user, int $id, int $version): array
    {
        $this->assertManager($user);
        $this->detail($user, $id);
        $files = $this->rows(
            'SELECT storage_key FROM lh_attachments WHERE household_id = ? '
            . "AND owner_type = 'document' AND owner_id = ?",
            [$user->householdId(), $id]
        );
        $delete = $this->pdo->prepare(
            'DELETE FROM lh_documents WHERE household_id = ? AND id = ? AND version = ? AND archived_at IS NULL'
        );
        $delete->execute([$user->householdId(), $id, $version]);
        if ($delete->rowCount() !== 1) {
            throw new ApiException(409, 'version.conflict', 'The document changed; reload and retry.');
        }
        $unlinkInventory = $this->pdo->prepare(
            'UPDATE lh_inventory SET document_id = NULL, updated_at = ?, version = version + 1 '
            . 'WHERE household_id = ? AND document_id = ?'
        );
        $unlinkInventory->execute([gmdate('Y-m-d H:i:s'), $user->householdId(), $id]);
        $attachments = $this->pdo->prepare(
            "DELETE FROM lh_attachments WHERE household_id = ? AND owner_type = 'document' AND owner_id = ?"
        );
        $attachments->execute([$user->householdId(), $id]);
        return array_values(array_map(function (array $row): string {
            return (string) $row['storage_key'];
        }, $files));
    }

    /** @return list<array<string, mixed>> */
    private function documents(UserContext $user, ?int $id = null): array
    {
        $sql = 'SELECT d.id, d.title, d.description, d.category_text, d.visibility, d.owner_id, '
            . 'd.created_by, d.created_at, d.updated_at, d.version, u.username AS owner_name, '
            . 'a.id AS attachment_id, a.original_name AS attachment_name, a.detected_mime AS attachment_mime, '
            . 'a.size_bytes AS attachment_size FROM lh_documents d '
            . 'LEFT JOIN lh_users u ON u.household_id = d.household_id AND u.id = d.owner_id '
            . "LEFT JOIN lh_attachments a ON a.id = (SELECT MAX(ax.id) FROM lh_attachments ax WHERE "
            . "ax.household_id = d.household_id AND ax.owner_type = 'document' AND ax.owner_id = d.id "
            . 'AND ax.archived_at IS NULL) WHERE d.household_id = ? AND d.archived_at IS NULL';
        $values = [$user->householdId()];
        if ($id !== null) {
            $sql .= ' AND d.id = ?';
            $values[] = $id;
        }
        $documents = $this->rows($sql . ' ORDER BY d.created_at DESC, d.id DESC', $values);
        foreach ($documents as &$document) {
            $document['can_edit'] = true;
        }
        unset($document);
        return $documents;
    }

    /** @param array{storageKey:string,mime:string,size:int,sha256:string,originalName:string} $file */
    private function insertAttachment(UserContext $user, int $documentId, array $file, string $now): int
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO lh_attachments (household_id, owner_type, owner_id, original_name, storage_key, '
            . 'detected_mime, size_bytes, sha256, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([
            $user->householdId(), 'document', $documentId, $file['originalName'], $file['storageKey'],
            $file['mime'], $file['size'], $file['sha256'], $user->id(), $now,
        ]);
        return (int) $this->pdo->lastInsertId();
    }

    private function assertManager(UserContext $user): void
    {
        if (!Authorization::canManageHousehold($user)) {
            throw new ApiException(403, 'authorization.denied', 'This role cannot access household documents.');
        }
    }

    private function searchKey(string $value): string
    {
        return (string) mb_substr(mb_strtolower(trim($value), 'UTF-8'), 0, 255, 'UTF-8');
    }

    /**
     * @param list<mixed> $parameters
     * @return list<array<string, mixed>>
     */
    private function rows(string $sql, array $parameters): array
    {
        $statement = $this->pdo->prepare($sql);
        $statement->execute($parameters);
        $rows = $statement->fetchAll();
        return is_array($rows) ? $rows : [];
    }
}
