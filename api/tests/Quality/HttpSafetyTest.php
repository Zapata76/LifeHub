<?php

/**
 * Prevents mutating GET routes and runtime DDL from entering the API.
 */

declare(strict_types=1);

namespace LifeHub\Tests\Quality;

use PHPUnit\Framework\TestCase;

final class HttpSafetyTest extends TestCase
{
    public function testApiHasNoMutatingGetOrRuntimeDdl(): void
    {
        $root = dirname(__DIR__, 2);
        $application = (string) file_get_contents($root . '/src/Application/ApplicationFactory.php');
        self::assertDoesNotMatchRegularExpression(
            '/->get\([^\n]+(?:delete|archive|restore|complete|create|update|generate)/i',
            $application
        );
        $files = glob($root . '/src/*/*.php') ?: [];
        foreach ($files as $file) {
            if (strpos(str_replace('\\', '/', $file), '/src/Installation/') !== false) {
                continue;
            }
            $contents = (string) file_get_contents($file);
            self::assertDoesNotMatchRegularExpression('/\b(?:CREATE|ALTER|DROP)\s+TABLE\b/i', $contents, $file);
        }
    }
}
