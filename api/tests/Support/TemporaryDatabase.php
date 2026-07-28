<?php

/**
 * Creates and safely removes an isolated lh_probe_* schema for destructive integration tests.
 */

declare(strict_types=1);

namespace LifeHub\Tests\Support;

use LifeHub\Shared\Config\Settings;
use PDO;
use RuntimeException;

final class TemporaryDatabase
{
    /** @var PDO */ private $server;
    /** @var PDO */ private $database;
    /** @var string */ private $name;

    public function __construct()
    {
        if (getenv('LIFEHUB_TEST_DB') !== '1') {
            throw new RuntimeException('Database integration tests are not enabled.');
        }
        $settings = Settings::fromFile();
        $host = $settings->get('dbHost');
        $port = $settings->get('dbPort');
        $user = $settings->get('dbUser');
        $pass = $settings->get('dbPass');
        $this->name = 'lh_probe_' . bin2hex(random_bytes(6));
        $this->assertSafeName();
        $this->server = new PDO(
            sprintf('mysql:host=%s;port=%s', $host, $port),
            $user,
            $pass,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
        $this->server->exec('CREATE DATABASE `' . $this->name . '` DEFAULT CHARACTER SET utf8');
        $this->database = new PDO(
            sprintf('mysql:host=%s;port=%s;dbname=%s', $host, $port, $this->name),
            $user,
            $pass,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
        $this->database->exec("SET NAMES 'utf8'");
    }

    public function pdo(): PDO
    {
        return $this->database;
    }

    public function name(): string
    {
        return $this->name;
    }

    public function drop(): void
    {
        $this->assertSafeName();
        $this->server->exec('DROP DATABASE IF EXISTS `' . $this->name . '`');
    }

    private function assertSafeName(): void
    {
        if (preg_match('/^lh_probe_[a-f0-9]{12}$/', $this->name) !== 1) {
            throw new RuntimeException('Refusing unsafe temporary database operation.');
        }
    }
}
