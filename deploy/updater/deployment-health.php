<?php

declare(strict_types=1);

// Read-only deployment probe. No session, application data or SQL migrations.
use LifeHub\Shared\Config\Settings;
use LifeHub\Shared\Persistence\PdoFactory;

require __DIR__ . '/vendor/autoload.php';
$pdo = PdoFactory::create(Settings::fromFile());
$contract = json_decode(file_get_contents(__DIR__ . '/schema-contract.json'), true, 512, JSON_THROW_ON_ERROR);
if (!is_array($contract) || $contract === []) {
    throw new RuntimeException('Schema contract missing');
}
foreach ($contract as $table => $columns) {
    if (!is_string($table) || !preg_match('/^lh_[a-z0-9_]+$/D', $table)
        || !is_array($columns) || $columns === []) {
        throw new RuntimeException('Invalid schema contract');
    }
    foreach ($columns as $column) {
        if (!is_string($column) || !preg_match('/^[a-z0-9_]+$/D', $column)) {
            throw new RuntimeException('Invalid schema column');
        }
    }
    $pdo->query('SELECT `' . implode('`, `', $columns) . '` FROM `' . $table . '` WHERE 1 = 0');
}
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['status' => 'ok', 'database' => 'reachable', 'schema' => 'ready']);
