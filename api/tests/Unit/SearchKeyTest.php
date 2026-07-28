<?php

/**
 * Verifies index projections preserve deterministic matching without becoming canonical storage.
 */

declare(strict_types=1);

namespace LifeHub\Tests\Unit;

use LifeHub\Shared\Text\SearchKey;
use PHPUnit\Framework\TestCase;

final class SearchKeyTest extends TestCase
{
    public function testNormalizesAccentsSpacingAndCase(): void
    {
        self::assertSame('caffe gia pronto', SearchKey::from('  Caffè   già-pronto  '));
    }

    public function testRespectsLengthLimit(): void
    {
        self::assertSame('abc', SearchKey::from('abcdef', 3));
    }
}
