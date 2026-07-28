<?php

/**
 * Life Hub production configuration.
 *
 * Copy this file outside the repository, fill in the database credentials,
 * then pass it to ops/build-release.ps1 with -ConfigurationFile.
 */

declare(strict_types=1);

$applicationRoot = dirname(__DIR__);
$privateRuntime = $applicationRoot . DIRECTORY_SEPARATOR . 'uploads';

return [
    'environment' => 'production',
    'apiBasePath' => '/umbertini/api',
    'siteName' => 'Hub Corso Umberto',

    'dbHost' => 'localhost',
    'dbPort' => '3306',
    'dbName' => 'REPLACE_WITH_PRODUCTION_DATABASE',
    'dbUser' => 'REPLACE_WITH_PRODUCTION_USER',
    'dbPass' => 'REPLACE_WITH_PRODUCTION_PASSWORD',

    'sessionName' => 'lifehub_prod',
    'sessionIdleSeconds' => '28800',

    // StorageGateway appends /files to this root automatically.
    'storagePath' => $privateRuntime,
    'logPath' => $privateRuntime . DIRECTORY_SEPARATOR . 'logs' . DIRECTORY_SEPARATOR . 'application.log',
];
