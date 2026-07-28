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
    /** @var string|null */ private $childOwnerField;
    /** @var bool */ private $childWritable;
    /** @var bool */ private $hasUpdatedBy;
    /** @var bool */ private $hasCreatedBy;
    /** @var bool */ private $hasUpdatedAt;
    /** @var bool */ private $childReadable;
    /** @var bool */ private $archivable;

    /**
     * @param list<string> $fields
     * @param list<string> $required
     * @param array<string, mixed> $defaults
     */
    public function __construct(
        string $entity,
        string $table,
        array $fields,
        array $required = [],
        array $defaults = [],
        ?string $searchSource = null,
        ?string $searchTarget = null,
        ?string $childOwnerField = null,
        bool $childWritable = false,
        bool $hasUpdatedBy = false,
        bool $hasCreatedBy = true,
        bool $hasUpdatedAt = true,
        bool $childReadable = true,
        bool $archivable = true
    ) {
        foreach (array_merge([$table], $fields) as $identifier) {
            if (preg_match('/^[a-z][a-z0-9_]*$/', $identifier) !== 1) {
                throw new InvalidArgumentException('Unsafe resource identifier.');
            }
        }
        $this->entity = $entity;
        $this->table = $table;
        $this->fields = $fields;
        $this->required = $required;
        $this->defaults = $defaults;
        $this->searchSource = $searchSource;
        $this->searchTarget = $searchTarget;
        $this->childOwnerField = $childOwnerField;
        $this->childWritable = $childWritable;
        $this->hasUpdatedBy = $hasUpdatedBy;
        $this->hasCreatedBy = $hasCreatedBy;
        $this->hasUpdatedAt = $hasUpdatedAt;
        $this->childReadable = $childReadable;
        $this->archivable = $archivable;
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
    public function childOwnerField(): ?string
    {
        return $this->childOwnerField;
    }
    public function childWritable(): bool
    {
        return $this->childWritable;
    }
    public function hasUpdatedBy(): bool
    {
        return $this->hasUpdatedBy;
    }
    public function hasCreatedBy(): bool
    {
        return $this->hasCreatedBy;
    }
    public function hasUpdatedAt(): bool
    {
        return $this->hasUpdatedAt;
    }

    public function childReadable(): bool
    {
        return $this->childReadable;
    }

    public function archivable(): bool
    {
        return $this->archivable;
    }
}
