<?php

/**
 * Represents a safe API error with an HTTP status and stable code.
 */

declare(strict_types=1);

namespace LifeHub\Shared\Http;

use RuntimeException;

final class ApiException extends RuntimeException
{
    /** @var int */
    private $status;

    public function __construct(int $status, string $code, string $message)
    {
        parent::__construct($message, 0);
        $this->status = $status;
        $this->apiCode = $code;
    }

    /** @var string */
    private $apiCode;

    public function status(): int
    {
        return $this->status;
    }

    public function apiCode(): string
    {
        return $this->apiCode;
    }
}
