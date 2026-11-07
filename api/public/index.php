<?php

/**
 * Serves the versioned Life Hub API from the shared-hosting public entry point.
 */

declare(strict_types=1);

use LifeHub\Application\ApplicationFactory;
use LifeHub\Shared\Config\Settings;

if (!defined('LIFEHUB_REQUEST_STARTED_NS')) {
    define('LIFEHUB_REQUEST_STARTED_NS', hrtime(true));
}
require dirname(__DIR__) . '/vendor/autoload.php';

$settings = Settings::fromFile();
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if ($path === $settings->apiPath() . '/v1/diagnostics/probe') {
    $request = \Slim\Psr7\Factory\ServerRequestFactory::createFromGlobals();
    $probe = new \LifeHub\Diagnostics\DiagnosticProbe($settings, new \LifeHub\Shared\Logging\StructuredLogger());
    (new \Slim\ResponseEmitter())->emit($probe->handle($request, LIFEHUB_REQUEST_STARTED_NS));
    exit;
}
ApplicationFactory::create($settings)->run();
