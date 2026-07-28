<?php

/**
 * Stores validated uploads under randomized non-executable keys outside the public API tree.
 */

declare(strict_types=1);

namespace LifeHub\Attachments;

use LifeHub\Shared\Http\ApiException;
use Psr\Http\Message\UploadedFileInterface;
use RuntimeException;

final class StorageGateway
{
    private const MAX_SIZE = 10485760;
    private const MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

    /** @var string */ private $root;

    public function __construct(string $root)
    {
        if (trim($root) === '') {
            throw new RuntimeException('The attachment storage path must be configured.');
        }
        $this->root = rtrim($root, DIRECTORY_SEPARATOR);
        $this->ensureDirectory($this->root . DIRECTORY_SEPARATOR . 'files');
    }

    /** @return array{storageKey:string, mime:string, size:int, sha256:string, originalName:string} */
    public function store(UploadedFileInterface $upload): array
    {
        if ($upload->getError() !== UPLOAD_ERR_OK) {
            throw new ApiException(422, 'attachment.upload_failed', 'The upload did not complete successfully.');
        }
        $size = $upload->getSize();
        if ($size === null || $size < 1 || $size > self::MAX_SIZE) {
            throw new ApiException(422, 'attachment.invalid_size', 'Files must be between 1 byte and 10 MiB.');
        }
        $key = bin2hex(random_bytes(24)) . '.blob';
        $path = $this->path($key);
        $upload->moveTo($path);
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($path);
        if (!is_string($mime) || !in_array($mime, self::MIME_TYPES, true)) {
            unlink($path);
            throw new ApiException(422, 'attachment.invalid_type', 'Only JPEG, PNG, and PDF files are supported.');
        }
        $checksum = hash_file('sha256', $path);
        if ($checksum === false) {
            unlink($path);
            throw new RuntimeException('Cannot checksum uploaded content.');
        }

        return [
            'storageKey' => $key,
            'mime' => $mime,
            'size' => $size,
            'sha256' => $checksum,
            'originalName' => basename((string) $upload->getClientFilename()),
        ];
    }

    public function filePath(string $key): string
    {
        $path = $this->path($key);
        if (!is_file($path)) {
            throw new ApiException(404, 'attachment.file_missing', 'Attachment content is unavailable.');
        }
        return $path;
    }

    public function discard(string $key): void
    {
        $path = $this->path($key);
        if (is_file($path)) {
            unlink($path);
        }
    }

    private function path(string $key): string
    {
        if (preg_match('/^[a-f0-9]{48}\.blob$/', $key) !== 1) {
            throw new RuntimeException('Unsafe attachment storage key.');
        }
        return $this->root . DIRECTORY_SEPARATOR . 'files' . DIRECTORY_SEPARATOR . $key;
    }

    private function ensureDirectory(string $path): void
    {
        if (!is_dir($path) && !mkdir($path, 0700, true) && !is_dir($path)) {
            throw new RuntimeException('Cannot initialize private attachment storage.');
        }
    }
}
