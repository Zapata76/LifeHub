<?php

/**
 * Builds deterministic index-safe projections while preserving canonical binary text.
 */

declare(strict_types=1);

namespace LifeHub\Shared\Text;

final class SearchKey
{
    public static function from(string $value, int $maxLength = 190): string
    {
        $value = trim(mb_strtolower($value, 'UTF-8'));
        $value = strtr($value, [
            'à' => 'a', 'á' => 'a', 'â' => 'a', 'ä' => 'a',
            'è' => 'e', 'é' => 'e', 'ê' => 'e', 'ë' => 'e',
            'ì' => 'i', 'í' => 'i', 'î' => 'i', 'ï' => 'i',
            'ò' => 'o', 'ó' => 'o', 'ô' => 'o', 'ö' => 'o',
            'ù' => 'u', 'ú' => 'u', 'û' => 'u', 'ü' => 'u',
            'ñ' => 'n', 'ç' => 'c',
        ]);
        $transliterated = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
        $ascii = $transliterated === false ? $value : $transliterated;
        $normalized = preg_replace('/[^a-z0-9]+/i', ' ', $ascii);
        $normalized = trim($normalized === null ? '' : $normalized);

        return mb_substr($normalized, 0, $maxLength, 'UTF-8');
    }
}
