<?php

/**
 * Loads and validates the application configuration file.
 */

declare(strict_types=1);

namespace LifeHub\Shared\Config;

use RuntimeException;

final class Settings
{
    /** @var array<string, string> */
    private $values;

    /**
     * @param array<string, string> $values
     */
    private function __construct(array $values)
    {
        $this->values = $values;
    }

    public static function fromFile(?string $path = null): self
    {
        $path = $path ?? dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . 'app.php';
        if (!is_file($path) || !is_readable($path)) {
            throw new RuntimeException(sprintf('Application configuration file is missing or unreadable: %s', $path));
        }

        $configuration = require $path;
        if (!is_array($configuration)) {
            throw new RuntimeException('Application configuration must return an array.');
        }

        return self::fromArray($configuration);
    }

    /**
     * Test and composition seam; production entry points use fromFile().
     *
     * @param array<string, mixed> $configuration
     */
    public static function fromArray(array $configuration): self
    {
        $defaults = [
            'environment' => 'production',
            'apiBasePath' => '/umbertini/api',
            'siteName' => 'Life Hub',
            'dbHost' => 'localhost',
            'dbPort' => '3306',
            'dbName' => '',
            'dbUser' => '',
            'dbPass' => '',
            'sessionName' => 'lifehub',
            'sessionIdleSeconds' => '28800',
            'storagePath' => '',
            'logPath' => '',
        ];
        $values = [];
        foreach ($defaults as $key => $default) {
            $value = array_key_exists($key, $configuration) ? $configuration[$key] : $default;
            if (!is_scalar($value) && $value !== null) {
                throw new RuntimeException(sprintf('Configuration value %s must be scalar.', $key));
            }
            $values[$key] = trim((string) ($value ?? ''));
        }

        if ($values['dbName'] === '' || $values['dbUser'] === '') {
            throw new RuntimeException('Database name and user must be configured.');
        }
        foreach (['dbName', 'dbUser', 'dbPass'] as $databaseKey) {
            if (strpos($values[$databaseKey], 'REPLACE_WITH_') === 0) {
                throw new RuntimeException(sprintf('Database setting %s still contains a placeholder.', $databaseKey));
            }
        }
        if (!ctype_digit($values['dbPort']) || !ctype_digit($values['sessionIdleSeconds'])) {
            throw new RuntimeException('Database port and session timeout must be numeric.');
        }
        if ((int) $values['sessionIdleSeconds'] < 60) {
            throw new RuntimeException('Session timeout must be at least 60 seconds.');
        }
        if (preg_match('/^[A-Za-z0-9_-]{1,64}$/', $values['sessionName']) !== 1) {
            throw new RuntimeException('Session name contains unsupported characters.');
        }
        if ($values['storagePath'] === '' || !self::isAbsolutePath($values['storagePath'])) {
            throw new RuntimeException('Storage path must be configured as an absolute filesystem path.');
        }
        if ($values['logPath'] !== '' && !self::isAbsolutePath($values['logPath'])) {
            throw new RuntimeException('Log path must be an absolute filesystem path when configured.');
        }

        return new self($values);
    }

    public function get(string $key): string
    {
        if (!array_key_exists($key, $this->values)) {
            throw new RuntimeException(sprintf('Unknown setting: %s', $key));
        }

        return $this->values[$key];
    }

    public function isDebug(): bool
    {
        return in_array($this->values['environment'], ['development', 'test'], true);
    }

    private static function isAbsolutePath(string $path): bool
    {
        return preg_match('#^(?:[A-Za-z]:[\\\\/]|/|\\\\\\\\)#', $path) === 1;
    }
}
