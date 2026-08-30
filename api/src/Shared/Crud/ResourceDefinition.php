<?php

/**
 * Declares a fixed safe persistence contract for one household resource.
 */

declare(strict_types=1);

namespace LifeHub\Shared\Crud;

use InvalidArgumentException;

final class ResourceDefinition
{
    /** @var string */ private $entity;
    /** @var string */ private $table;
    /** @var list<string> */ private $fields;
    /** @var list<string> */ private $required;
    /** @var array<string, mixed> */ private $defaults;
    /** @var string|null */ private $searchSource;
    /** @var string|null */ private $searchTarget;
    /** @var bool */ private $hasUpdatedAt;
    /** @var array<string, int> */ private $stringLimits;

    /**
     * @param list<string> $fields
     * @param list<string> $required
     * @param array<string, mixed> $defaults
     * @param array<string, int> $stringLimits
     */
    public function __construct(
        string $entity,
        string $table,
        array $fields,
        array $required = [],
        array $defaults = [],
        ?string $searchSource = null,
        ?string $searchTarget = null,
        bool $hasUpdatedAt = true,
        array $stringLimits = []
    ) {
        foreach (array_merge([$table], $fields) as $identifier) {
            if (preg_match('/^[a-z][a-z0-9_]*$/', $identifier) !== 1) {
                throw new InvalidArgumentException('Unsafe resource identifier.');
            }
        }
        foreach ($stringLimits as $field => $limit) {
            if (!in_array($field, $fields, true) || !is_int($limit) || $limit < 1) {
                throw new InvalidArgumentException('Invalid resource string limit.');
            }
        }
        $this->entity = $entity;
        $this->table = $table;
        $this->fields = $fields;
        $this->required = $required;
        $this->defaults = $defaults;
        $this->searchSource = $searchSource;
        $this->searchTarget = $searchTarget;
        $this->hasUpdatedAt = $hasUpdatedAt;
        $this->stringLimits = $stringLimits;
    }

    public function entity(): string
    {
        return $this->entity;
    }
    public function table(): string
    {
        return $this->table;
    }
    /** @return list<string> */ public function fields(): array
    {
        return $this->fields;
    }
    /** @return list<string> */ public function required(): array
    {
        return $this->required;
    }
    /** @return array<string, mixed> */ public function defaults(): array
    {
        return $this->defaults;
    }
    public function searchSource(): ?string
    {
        return $this->searchSource;
    }
    public function searchTarget(): ?string
    {
        return $this->searchTarget;
    }
    public function hasUpdatedAt(): bool
    {
        return $this->hasUpdatedAt;
    }
    public function stringLimit(string $field): ?int
    {
        return $this->stringLimits[$field] ?? null;
    }
}
