<?php

/**
 * Parses the deliberately simple, MySQL 5.0-compatible Life Hub schema.
 */

declare(strict_types=1);

namespace LifeHub\Installation;

use RuntimeException;

final class SqlScript
{
    /**
     * @return list<string>
     */
    public static function statements(string $sql): array
    {
        $withoutComments = preg_replace('/^\s*--.*$/m', '', $sql);
        if ($withoutComments === null) {
            throw new RuntimeException('Unable to parse SQL comments.');
        }
        $parts = preg_split('/;\s*(?:\r?\n|$)/', $withoutComments) ?: [];
        $statements = [];
        foreach ($parts as $part) {
            $statement = trim($part);
            if ($statement !== '') {
                $statements[] = $statement;
            }
        }
        return $statements;
    }
}
