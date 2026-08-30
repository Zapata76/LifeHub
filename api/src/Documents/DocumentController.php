<?php

/** Validates document metadata and coordinates private multi-file uploads. */

declare(strict_types=1);

namespace LifeHub\Documents;

use LifeHub\Attachments\StorageGateway;
use LifeHub\Shared\Audit\AuditLogger;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Http\JsonResponder;
use LifeHub\Shared\Http\RequestData;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Message\UploadedFileInterface;
use Throwable;

final class DocumentController
{
    private const MAX_FILES = 10;

    /** @var DocumentRepository */ private $documents;
    /** @var AuditLogger */ private $audit;
    /** @var StorageGateway */ private $storage;

    public function __construct(DocumentRepository $documents, AuditLogger $audit, StorageGateway $storage)
    {
        $this->documents = $documents;
        $this->audit = $audit;
        $this->storage = $storage;
    }

    public function overview(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return JsonResponder::write($response, $this->documents->overview($this->user($request)));
    }

    /** @param array<string, string> $args */
    public function detail(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        return JsonResponder::write($response, ['item' => $this->documents->detail(
            $this->user($request),
            (int) $args['id']
        )]);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $this->user($request);
        $files = $this->storeUploads($this->uploads($request, true));
        try {
            $id = $this->documents->create($user, $this->document(new RequestData($request)), $files);
        } catch (Throwable $exception) {
            $this->discardFiles($files);
            throw $exception;
        }
        $this->record($request, $user, 'document.created', $id);
        return JsonResponder::write($response, ['id' => $id], 201);
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->user($request);
        $data = new RequestData($request);
        $files = $this->storeUploads($this->uploads($request, false));
        try {
            $this->documents->update(
                $user,
                (int) $args['id'],
                $data->requiredInt('version'),
                $this->document($data),
                $files
            );
        } catch (Throwable $exception) {
            $this->discardFiles($files);
            throw $exception;
        }
        $id = (int) $args['id'];
        $this->record($request, $user, 'document.updated', $id);
        return JsonResponder::write($response, ['updated' => true]);
    }

    /** @param array<string, string> $args */
    public function deleteAttachment(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        $user = $this->user($request);
        $documentId = (int) $args['id'];
        $storageKey = $this->documents->deleteAttachment(
            $user,
            $documentId,
            (int) $args['attachmentId'],
            (new RequestData($request))->requiredInt('version')
        );
        $this->storage->discard($storageKey);
        $this->record($request, $user, 'document.attachment_deleted', $documentId);
        return JsonResponder::write($response, ['deleted' => true]);
    }

    /** @param array<string, string> $args */
    public function delete(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->user($request);
        $id = (int) $args['id'];
        $keys = $this->documents->delete($user, $id, (new RequestData($request))->requiredInt('version'));
        foreach ($keys as $key) {
            $this->storage->discard($key);
        }
        $this->record($request, $user, 'document.deleted', $id);
        return JsonResponder::write($response, ['deleted' => true]);
    }

    /** @return array<string, string> */
    private function document(RequestData $data): array
    {
        return [
            'title' => $data->requiredString('title', 255),
            'category' => $data->optionalString('category', 100) ?: 'Altro',
            'notes' => $data->optionalString('notes', 20000) ?: '',
        ];
    }

    /** @return list<UploadedFileInterface> */
    private function uploads(ServerRequestInterface $request, bool $required): array
    {
        $uploaded = $request->getUploadedFiles();
        $candidate = $uploaded['files'] ?? ($uploaded['file'] ?? []);
        if ($candidate instanceof UploadedFileInterface) {
            $uploads = [$candidate];
        } elseif (is_array($candidate)) {
            $uploads = array_values(array_filter($candidate, function ($upload): bool {
                return $upload instanceof UploadedFileInterface;
            }));
        } else {
            $uploads = [];
        }
        if (count($uploads) > self::MAX_FILES) {
            throw new ApiException(422, 'document.too_many_files', 'A document can contain at most 10 files.');
        }
        if ($required && count($uploads) === 0) {
            throw new ApiException(422, 'document.file_required', 'A PDF, JPEG, or PNG file is required.');
        }
        return $uploads;
    }

    /**
     * @param list<UploadedFileInterface> $uploads
     * @return list<array{storageKey:string,mime:string,size:int,sha256:string,originalName:string}>
     */
    private function storeUploads(array $uploads): array
    {
        $files = [];
        try {
            foreach ($uploads as $upload) {
                $files[] = $this->storage->store($upload);
            }
        } catch (Throwable $exception) {
            $this->discardFiles($files);
            throw $exception;
        }
        return $files;
    }

    /**
     * @param list<array{storageKey:string,mime:string,size:int,sha256:string,originalName:string}> $files
     */
    private function discardFiles(array $files): void
    {
        foreach ($files as $file) {
            $this->storage->discard($file['storageKey']);
        }
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
            'document',
            $id,
            (string) $request->getAttribute('correlationId', 'unavailable')
        );
    }
}
