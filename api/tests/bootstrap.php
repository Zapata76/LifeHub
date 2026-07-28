<?php

/**
 * Boots the isolated Life Hub test suites.
 */

declare(strict_types=1);

date_default_timezone_set('Europe/Rome');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_name('lifehub_test');
    session_start();
}

$autoloadPath = dirname(__DIR__) . '/vendor/autoload.php';
if (!is_file($autoloadPath)) {
    fwrite(STDERR, "Dependencies are missing. Run the verified Composer install first.\n");
    exit(1);
}

require $autoloadPath;
