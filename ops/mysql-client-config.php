<?php

/**
 * Writes a temporary MySQL client option file from the Life Hub configuration.
 */

declare(strict_types=1);

use LifeHub\Shared\Config\Settings;

require dirname(__DIR__) . '/api/vendor/autoload.php';

$configurationPath = $argv[1] ?? '';
$outputPath = $argv[2] ?? '';
if ($configurationPath === '' || $outputPath === '') {
    fwrite(STDERR, "Usage: mysql-client-config.php <app.php> <output.cnf>\n");
    exit(2);
}

try {
    $settings = Settings::fromFile($configurationPath);
    $values = [
        'host' => (string) $settings->get('dbHost'),
        'port' => (string) $settings->get('dbPort'),
        'user' => (string) $settings->get('dbUser'),
        'password' => (string) $settings->get('dbPass'),
    ];

    $lines = ['[client]', 'protocol=tcp'];
    foreach ($values as $key => $value) {
        if (preg_match('/[\x00\r\n]/', $value) === 1) {
            throw new RuntimeException(sprintf('Database setting %s contains invalid control characters.', $key));
        }
        $escaped = str_replace(['\\', '"'], ['\\\\', '\\"'], $value);
        $lines[] = sprintf('%s="%s"', $key, $escaped);
    }

    $written = file_put_contents($outputPath, implode(PHP_EOL, $lines) . PHP_EOL, LOCK_EX);
    if ($written === false) {
        throw new RuntimeException('Unable to write the temporary MySQL option file.');
    }

    echo (string) $settings->get('dbName');
} catch (Throwable $exception) {
    fwrite(STDERR, sprintf("Unable to prepare MySQL client configuration: %s\n", $exception->getMessage()));
    exit(1);
}
