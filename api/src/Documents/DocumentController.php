<?php

/** Validates document metadata and coordinates private file replacement. */

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
        $upload = $this->upload($request, true);
        if ($upload === null) {
            throw new ApiException(422, 'document.file_required', 'A PDF, JPEG, or PNG file is required.');
        }
        $file = $this->storage->store($upload);
        try {
            $id = $this->documents->create($user, $this->document(new RequestData($request)), $file);
        } catch (Throwable $exception) {
            $this->storage->discard($file['storageKey']);
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
        $upload = $this->upload($request, false);
        $file = $upload === null ? null : $this->storage->store($upload);
        try {
            $oldKeys = $this->documents->update(
                $user,
                (int) $args['id'],
                $data->requiredInt('version'),
                $this->document($data),
                $file
            );
        } catch (Throwable $exception) {
            if ($file !== null) {
                $this->storage->discard($file['storageKey']);
            }
            throw $exception;
        }
        foreach ($oldKeys as $key) {
            $this->storage->discard($key);
        }
        $id = (int) $args['id'];
        $this->record($request, $user, 'document.updated', $id);
        return JsonResponder::write($response, ['updated' => true]);
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

    private function upload(ServerRequestInterface $request, bool $required): ?UploadedFileInterface
    {
        $upload = $request->getUploadedFiles()['file'] ?? null;
        if ($upload instanceof UploadedFileInterface) {
            return $upload;
        }
        if ($required) {
            throw new ApiException(422, 'document.file_required', 'A PDF, JPEG, or PNG file is required.');
        }
        return null;
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
