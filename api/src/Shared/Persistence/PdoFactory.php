<?php

/**
 * Creates a MySQL 5.0-compatible PDO connection with strict client behavior.
 */

declare(strict_types=1);

namespace LifeHub\Shared\Persistence;

use LifeHub\Shared\Config\Settings;
use PDO;

final class PdoFactory
{
    public static function create(Settings $settings): PDO
    {
        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s',
            $settings->get('dbHost'),
            $settings->get('dbPort'),
            $settings->get('dbName')
        );

        $pdo = new TimedPdo(
            $dsn,
            $settings->get('dbUser'),
            $settings->get('dbPass'),
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_STRINGIFY_FETCHES => false,
            ]
        );
        $pdo->setAttribute(PDO::ATTR_STATEMENT_CLASS, [TimedPdoStatement::class]);
        $pdo->exec("SET NAMES 'utf8'");

        return $pdo;
    }
}
