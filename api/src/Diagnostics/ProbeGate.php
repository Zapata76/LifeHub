<?php

declare(strict_types=1);

namespace LifeHub\Diagnostics;

use RuntimeException;

/** One global slot per installation, independent of caller IP and token rotation. */
final class ProbeGate
{
    /** @var resource|null */
    private $handle = null;

    public function __construct(private string $storagePath)
    {
    }

    public function acquire(): bool
    {
        $handle = @fopen($this->storagePath . '/diagnostic-probe.lock', 'c+');
        if ($handle === false) {
            throw new RuntimeException('Probe gate unavailable');
        }
        if (!flock($handle, LOCK_EX | LOCK_NB)) {
            fclose($handle);
            return false;
        }
        $last = trim((string) stream_get_contents($handle));
        if ($last !== '' && (!ctype_digit($last) || time() - (int) $last < 60)) {
            flock($handle, LOCK_UN);
            fclose($handle);
            return false;
        }
        $this->handle = $handle;
        $stamp = (string) time();
        if (
            !ftruncate($handle, 0) || !rewind($handle)
            || fwrite($handle, $stamp) !== strlen($stamp) || !fflush($handle)
        ) {
            $this->release();
            throw new RuntimeException('Probe gate unavailable');
        }
        return true;
    }

    public function release(): void
    {
        if (is_resource($this->handle)) {
            flock($this->handle, LOCK_UN);
            fclose($this->handle);
        }
        $this->handle = null;
    }
}
