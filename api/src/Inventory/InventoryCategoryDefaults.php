<?php

/**
 * Seeds the configurable inventory catalogue with its initial household categories.
 */

declare(strict_types=1);

namespace LifeHub\Inventory;

use LifeHub\Shared\Text\SearchKey;
use PDO;

final class InventoryCategoryDefaults
{
    /** @var list<string> */
    private const NAMES = ['Tecnologia', 'Attrezzi', 'Giochi', 'Documenti', 'Altro'];

    public static function seed(PDO $pdo, int $householdId, int $userId, string $now): void
    {
        $statement = $pdo->prepare(
            'INSERT INTO lh_inventory_categories '
            . '(household_id, name, name_key, is_fallback, created_by, created_at, updated_at) '
            . 'VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        foreach (self::NAMES as $name) {
            $statement->execute([
                $householdId,
                $name,
                SearchKey::from($name),
                $name === 'Altro' ? 1 : 0,
                $userId,
                $now,
                $now,
            ]);
        }
    }
}
