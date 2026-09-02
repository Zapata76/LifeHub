<?php

/** Handles validated private upload and authorized download. */

declare(strict_types=1);

namespace LifeHub\Attachments;

use LifeHub\Shared\Audit\AuditLogger;
use LifeHub\Shared\Auth\UserContext;
use LifeHub\Shared\Http\ApiException;
use LifeHub\Shared\Http\JsonResponder;
use LifeHub\Shared\Http\RequestData;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Message\UploadedFileInterface;
use Slim\Psr7\Factory\StreamFactory;
use Throwable;

final class AttachmentController
{
    /** @var AttachmentRepository */ private $attachments;
    /** @var AttachmentPolicy */ private $policy;
    /** @var StorageGateway */ private $storage;
    /** @var AuditLogger */ private $audit;

    public function __construct(
        AttachmentRepository $attachments,
        AttachmentPolicy $policy,
        StorageGateway $storage,
        AuditLogger $audit
    ) {
        $this->attachments = $attachments;
        $this->policy = $policy;
        $this->storage = $storage;
        $this->audit = $audit;
    }

    public function upload(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $this->user($request);
        $data = new RequestData($request);
        $ownerType = $data->requiredString('ownerType', 64);
        $ownerId = $data->requiredInt('ownerId');
        if (!$this->policy->canUpload($user, $ownerType, $ownerId)) {
            throw new ApiException(404, 'attachment.owner_not_found', 'Attachment owner not found.');
        }
        if (
            $ownerType === 'inventory'
            && $this->attachments->countActive($user, $ownerType, $ownerId) >= 10
        ) {
            throw new ApiException(
                422,
                'inventory.too_many_images',
                'An inventory item can contain at most 10 images.'
            );
        }
        $upload = $request->getUploadedFiles()['file'] ?? null;
        if (!$upload instanceof UploadedFileInterface) {
            throw new ApiException(422, 'attachment.file_required', 'A file upload is required.');
        }
        $file = $this->storage->store($upload);
        try {
            if ($ownerType === 'inventory' && strpos($file['mime'], 'image/') !== 0) {
                throw new ApiException(
                    422,
                    'inventory.image_type_invalid',
                    'Inventory attachments must be JPEG or PNG images.'
                );
            }
            $id = $this->attachments->create($user, $ownerType, $ownerId, $file);
        } catch (Throwable $exception) {
            $this->storage->discard($file['storageKey']);
            throw $exception;
        }
        $this->record($request, $user, 'attachment.uploaded', $id);
        return JsonResponder::write($response, ['item' => $this->attachments->find($user, $id)], 201);
    }

    /** @param array<string, string> $args */
    public function download(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        $user = $this->user($request);
        $attachment = $this->attachments->find($user, (int) $args['id']);
        if (!$this->policy->canRead($user, $attachment)) {
            throw new ApiException(404, 'attachment.not_found', 'Attachment not found.');
        }
        $path = $this->storage->filePath((string) $attachment['storage_key']);
        $name = rawurlencode((string) $attachment['original_name']);
        $mime = (string) $attachment['detected_mime'];
        $inline = ($request->getQueryParams()['inline'] ?? '0') === '1'
            && (strpos($mime, 'image/') === 0 || $mime === 'application/pdf');
        $etag = '"' . (string) $attachment['sha256'] . '"';
        $cacheControl = (string) $attachment['owner_type'] === 'document'
            ? 'private, no-store'
            : 'private, max-age=3600, must-revalidate';
        $response = $response
            ->withHeader('Content-Type', (string) $attachment['detected_mime'])
            ->withHeader('Content-Length', (string) $attachment['size_bytes'])
            ->withHeader('Content-Disposition', ($inline ? 'inline' : 'attachment') . "; filename*=UTF-8''" . $name)
            ->withHeader('Cache-Control', $cacheControl)
            ->withHeader('ETag', $etag);
        if ($request->getHeaderLine('If-None-Match') === $etag && $cacheControl !== 'private, no-store') {
            return $response->withStatus(304)->withoutHeader('Content-Length');
        }

        return $response->withBody((new StreamFactory())->createStreamFromFile($path, 'r'));
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
            'attachment',
            $id,
            (string) $request->getAttribute('correlationId', 'unavailable')
        );
    }
}
