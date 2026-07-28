<?php

/** Persists household-owned labels used by the home hero. */

declare(strict_types=1);

namespace LifeHub\Home;

use LifeHub\Shared\Http\ApiException;
use PDO;

final class HomeSettingsRepository
{
    private const DEFAULT_EYEBROW = 'Oggi in famiglia';
    private const DEFAULT_TITLE = 'Simona puzzona';

    /** @var PDO */ private $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /** @return array{homeEyebrow:string, homeTitle:string, version:int} */
    public function read(int $householdId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT home_eyebrow, home_title, version FROM lh_households WHERE id = ? LIMIT 1'
        );
        $statement->execute([$householdId]);
        $row = $statement->fetch();
        if (!is_array($row)) {
            throw new ApiException(404, 'household.not_found', 'Household not found.');
        }
        $eyebrow = trim((string) ($row['home_eyebrow'] ?? ''));
        $title = trim((string) ($row['home_title'] ?? ''));
        return [
            'homeEyebrow' => $eyebrow !== '' ? $eyebrow : self::DEFAULT_EYEBROW,
            'homeTitle' => $title !== '' ? $title : self::DEFAULT_TITLE,
            'version' => (int) $row['version'],
        ];
    }

    public function update(int $householdId, string $eyebrow, string $title, int $version): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE lh_households SET home_eyebrow = ?, home_title = ?, updated_at = ?, '
            . 'version = version + 1 WHERE id = ? AND version = ?'
        );
        $statement->execute([$eyebrow, $title, gmdate('Y-m-d H:i:s'), $householdId, $version]);
        if ($statement->rowCount() !== 1) {
            throw new ApiException(409, 'version.conflict', 'The home labels were modified by another request.');
        }
    }
}
