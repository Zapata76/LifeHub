<?php

/**
 * Reads and validates scalar JSON request fields with stable client errors.
 */

declare(strict_types=1);

namespace LifeHub\Shared\Http;

use Psr\Http\Message\ServerRequestInterface;

final class RequestData
{
    /** @var array<string, mixed> */
    private $data;

    public function __construct(ServerRequestInterface $request)
    {
        $parsed = $request->getParsedBody();
        $this->data = is_array($parsed) ? $parsed : [];
    }

    public function requiredString(string $name, int $maxLength = 255): string
    {
        $value = $this->optionalString($name, $maxLength);
        if ($value === null || $value === '') {
            throw new ApiException(422, 'validation.required', sprintf('%s is required.', $name));
        }

        return $value;
    }

    public function optionalString(string $name, int $maxLength = 255): ?string
    {
        if (!array_key_exists($name, $this->data) || $this->data[$name] === null) {
            return null;
        }
        if (!is_string($this->data[$name])) {
            throw new ApiException(422, 'validation.string', sprintf('%s must be a string.', $name));
        }
        $value = trim($this->data[$name]);
        if (mb_strlen($value, 'UTF-8') > $maxLength) {
            throw new ApiException(422, 'validation.length', sprintf('%s is too long.', $name));
        }

        return $value;
    }

    public function optionalInt(string $name): ?int
    {
        if (!array_key_exists($name, $this->data) || $this->data[$name] === null || $this->data[$name] === '') {
            return null;
        }
        $value = filter_var($this->data[$name], FILTER_VALIDATE_INT);
        if ($value === false) {
            throw new ApiException(422, 'validation.integer', sprintf('%s must be an integer.', $name));
        }

        return (int) $value;
    }

    public function requiredInt(string $name): int
    {
        $value = $this->optionalInt($name);
        if ($value === null) {
            throw new ApiException(422, 'validation.required', sprintf('%s is required.', $name));
        }

        return $value;
    }

    public function optionalBool(string $name): ?bool
    {
        if (!array_key_exists($name, $this->data) || $this->data[$name] === null) {
            return null;
        }
        if (!is_bool($this->data[$name])) {
            throw new ApiException(422, 'validation.boolean', sprintf('%s must be a boolean.', $name));
        }

        return $this->data[$name];
    }

    /** @return mixed */
    public function value(string $name)
    {
        return array_key_exists($name, $this->data) ? $this->data[$name] : null;
    }

    public function has(string $name): bool
    {
        return array_key_exists($name, $this->data);
    }
}
