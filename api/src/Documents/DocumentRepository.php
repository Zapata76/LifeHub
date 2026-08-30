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
    private const MAX_ATTACHMENTS = 10;

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
     * @param list<array{storageKey:string,mime:string,size:int,sha256:string,originalName:string}> $files
     */
    public function create(UserContext $user, array $document, array $files): int
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
            foreach ($files as $file) {
                $this->insertAttachment($user, $id, $file, $now);
            }
        } catch (Throwable $exception) {
            $attachments = $this->pdo->prepare(
                "DELETE FROM lh_attachments WHERE household_id = ? AND owner_type = 'document' AND owner_id = ?"
            );
            $attachments->execute([$user->householdId(), $id]);
            $cleanup = $this->pdo->prepare('DELETE FROM lh_documents WHERE household_id = ? AND id = ?');
            $cleanup->execute([$user->householdId(), $id]);
            throw $exception;
        }
        return $id;
    }

    /**
     * @param array<string, string> $document
     * @param list<array{storageKey:string,mime:string,size:int,sha256:string,originalName:string}> $files
     */
    public function update(UserContext $user, int $id, int $version, array $document, array $files): void
    {
        $this->assertManager($user);
        $current = $this->detail($user, $id);
        $attachments = $current['attachments'];
        $attachmentCount = is_array($attachments) ? count($attachments) : 0;
        if ($attachmentCount + count($files) > self::MAX_ATTACHMENTS) {
            throw new ApiException(422, 'document.too_many_files', 'A document can contain at most 10 files.');
        }
        $newAttachmentIds = [];
        try {
            foreach ($files as $file) {
                $newAttachmentIds[] = $this->insertAttachment(
                    $user,
                    $id,
                    $file,
                    gmdate('Y-m-d H:i:s')
                );
            }
        } catch (Throwable $exception) {
            $this->deleteAttachmentIds($user, $newAttachmentIds);
            throw $exception;
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
            $this->deleteAttachmentIds($user, $newAttachmentIds);
            throw new ApiException(409, 'version.conflict', 'The document changed; reload and retry.');
        }
    }

    public function deleteAttachment(UserContext $user, int $id, int $attachmentId, int $version): string
    {
        $this->assertManager($user);
        $this->detail($user, $id);
        $this->pdo->beginTransaction();
        try {
            $attachment = $this->pdo->prepare(
                'SELECT storage_key FROM lh_attachments WHERE household_id = ? '
                . "AND owner_type = 'document' AND owner_id = ? AND id = ? AND archived_at IS NULL"
            );
            $attachment->execute([$user->householdId(), $id, $attachmentId]);
            $storageKey = $attachment->fetchColumn();
            if (!is_string($storageKey)) {
                throw new ApiException(404, 'document.attachment_not_found', 'Document file not found.');
            }

            $document = $this->pdo->prepare(
                'UPDATE lh_documents SET updated_at = ?, version = version + 1 '
                . 'WHERE household_id = ? AND id = ? AND version = ? AND archived_at IS NULL'
            );
            $document->execute([gmdate('Y-m-d H:i:s'), $user->householdId(), $id, $version]);
            if ($document->rowCount() !== 1) {
                throw new ApiException(409, 'version.conflict', 'The document changed; reload and retry.');
            }

            $delete = $this->pdo->prepare(
                "DELETE FROM lh_attachments WHERE household_id = ? AND owner_type = 'document' "
                . 'AND owner_id = ? AND id = ?'
            );
            $delete->execute([$user->householdId(), $id, $attachmentId]);
            if ($delete->rowCount() !== 1) {
                throw new ApiException(409, 'version.conflict', 'The document file changed; reload and retry.');
            }
            $this->pdo->commit();
            return $storageKey;
        } catch (Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $exception;
        }
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
            . 'd.created_by, d.created_at, d.updated_at, d.version, u.username AS owner_name '
            . 'FROM lh_documents d '
            . 'LEFT JOIN lh_users u ON u.household_id = d.household_id AND u.id = d.owner_id '
            . 'WHERE d.household_id = ? AND d.archived_at IS NULL';
        $values = [$user->householdId()];
        if ($id !== null) {
            $sql .= ' AND d.id = ?';
            $values[] = $id;
        }
        $documents = $this->rows($sql . ' ORDER BY d.created_at DESC, d.id DESC', $values);

        $attachmentsByDocument = [];
        foreach ($this->attachments($user, $id) as $attachment) {
            $documentId = (int) $attachment['owner_id'];
            $attachmentsByDocument[$documentId][] = [
                'id' => (int) $attachment['id'],
                'name' => (string) $attachment['original_name'],
                'mime' => (string) $attachment['detected_mime'],
                'size' => (int) $attachment['size_bytes'],
            ];
        }
        foreach ($documents as &$document) {
            $attachments = $attachmentsByDocument[(int) $document['id']] ?? [];
            $latest = count($attachments) > 0 ? $attachments[count($attachments) - 1] : null;
            $document['attachments'] = $attachments;
            $document['attachment_id'] = $latest === null ? null : $latest['id'];
            $document['attachment_name'] = $latest === null ? null : $latest['name'];
            $document['attachment_mime'] = $latest === null ? null : $latest['mime'];
            $document['attachment_size'] = $latest === null ? null : $latest['size'];
            $document['can_edit'] = true;
        }
        unset($document);
        return $documents;
    }

    /** @return list<array<string, mixed>> */
    private function attachments(UserContext $user, ?int $documentId): array
    {
        $sql = 'SELECT id, owner_id, original_name, detected_mime, size_bytes FROM lh_attachments '
            . "WHERE household_id = ? AND owner_type = 'document' AND archived_at IS NULL";
        $values = [$user->householdId()];
        if ($documentId !== null) {
            $sql .= ' AND owner_id = ?';
            $values[] = $documentId;
        }
        return $this->rows($sql . ' ORDER BY owner_id, created_at, id', $values);
    }

    /** @param list<int> $ids */
    private function deleteAttachmentIds(UserContext $user, array $ids): void
    {
        if (count($ids) === 0) {
            return;
        }
        $statement = $this->pdo->prepare(
            "DELETE FROM lh_attachments WHERE household_id = ? AND owner_type = 'document' AND id = ?"
        );
        foreach ($ids as $id) {
            $statement->execute([$user->householdId(), $id]);
        }
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
        return $rows;
    }
}
