<?php

/**
 * Serves the versioned Life Hub API from the shared-hosting public entry point.
 */

declare(strict_types=1);

use LifeHub\Application\ApplicationFactory;
use LifeHub\Shared\Config\Settings;

require dirname(__DIR__) . '/vendor/autoload.php';

ApplicationFactory::create(Settings::fromFile())->run();
