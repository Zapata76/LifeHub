<?php

/**
 * Provides a safely named private filesystem root for attachment integration tests.
 */

declare(strict_types=1);

namespace LifeHub\Tests\Support;

use FilesystemIterator;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use RuntimeException;
use SplFileInfo;

final class TemporaryStorage
{
    /** @var string */ private $path;

    public function __construct()
    {
        $this->path = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'lifehub_storage_' . bin2hex(random_bytes(6));
        if (!mkdir($this->path, 0700) && !is_dir($this->path)) {
            throw new RuntimeException('Cannot create temporary storage.');
        }
    }

    public function path(): string
    {
        return $this->path;
    }

    public function remove(): void
    {
        if (preg_match('/lifehub_storage_[a-f0-9]{12}$/', $this->path) !== 1 || !is_dir($this->path)) {
            return;
        }
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($this->path, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($iterator as $item) {
            if (!$item instanceof SplFileInfo) {
                continue;
            }
            $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
        }
        rmdir($this->path);
    }
}
