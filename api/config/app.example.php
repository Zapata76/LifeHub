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
    // Empty installs at the domain root; nested example: /apps/family/lifehub
    'basePath' => '',
    'siteName' => 'Life Hub',

    'dbHost' => 'localhost',
    'dbPort' => '3306',
    'dbName' => 'REPLACE_WITH_PRODUCTION_DATABASE',
    'dbUser' => 'REPLACE_WITH_PRODUCTION_USER',
    'dbPass' => 'REPLACE_WITH_PRODUCTION_PASSWORD',

    'sessionName' => 'lifehub_prod',
    'sessionIdleSeconds' => '28800',

    // StorageGateway appends /files to this root automatically.
    'storagePath' => $privateRuntime,

    // Used only by the external daily-job endpoint. Generate a random value of at least 32 characters.
    'jobToken' => 'REPLACE_WITH_A_LONG_RANDOM_JOB_TOKEN',
    // PHP mail() sender accepted by the hosting account.
    'mailFromAddress' => 'no-reply@example.com',
    'mailFromName' => 'Life Hub',
    // Public application URL, without trailing slash; notification links append /tasks.
    'publicUrl' => 'https://example.com/lifehub',
];
