<?php

/**
 * Applies the complete Life Hub schema exactly once to a new, empty database.
 */

declare(strict_types=1);

namespace LifeHub\Installation;

use PDO;
use RuntimeException;

final class SchemaInitializer
{
    /** @var PDO */
    private $pdo;
    /** @var string */
    private $schemaFile;

    public function __construct(PDO $pdo, string $schemaFile)
    {
        $this->pdo = $pdo;
        $this->schemaFile = $schemaFile;
    }

    /**
     * @return array{schema:string,checksum:string,statementCount:int,tableCount:int,dryRun:bool}
     */
    public function initialize(bool $dryRun): array
    {
        $sql = file_get_contents($this->schemaFile);
        if ($sql === false) {
            throw new RuntimeException('Cannot read the Life Hub schema.');
        }
        $checksum = hash('sha256', $sql);
        $statements = SqlScript::statements($sql);
        $tables = $this->schemaTables($sql);
        if ($statements === [] || $tables === []) {
            throw new RuntimeException('The Life Hub schema is empty or invalid.');
        }

        $existing = $this->lifeHubTableCount();
        if ($existing !== 0) {
            throw new RuntimeException(sprintf(
                'Database initialization requires an empty target; found %d Life Hub table(s).',
                $existing
            ));
        }

        if (!$dryRun) {
            foreach ($statements as $statement) {
                $this->pdo->exec($statement);
            }
            $created = $this->lifeHubTableCount();
            if ($created !== count($tables)) {
                throw new RuntimeException(sprintf(
                    'Schema initialization created %d of %d expected tables.',
                    $created,
                    count($tables)
                ));
            }
        }

        return [
            'schema' => basename($this->schemaFile),
            'checksum' => $checksum,
            'statementCount' => count($statements),
            'tableCount' => count($tables),
            'dryRun' => $dryRun,
        ];
    }

    private function lifeHubTableCount(): int
    {
        $statement = $this->pdo->query(
            "SELECT COUNT(*) FROM information_schema.tables "
            . "WHERE table_schema = DATABASE() AND LEFT(table_name, 3) = 'lh_'"
        );
        if ($statement === false) {
            throw new RuntimeException('Cannot inspect the target database.');
        }
        return (int) $statement->fetchColumn();
    }

    /**
     * @return list<string>
     */
    private function schemaTables(string $sql): array
    {
        $matches = [];
        preg_match_all('/CREATE TABLE IF NOT EXISTS `([^`]+)`/i', $sql, $matches);
        $tables = $matches[1];
        return array_values(array_unique(array_map('strval', $tables)));
    }
}
