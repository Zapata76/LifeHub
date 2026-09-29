<?php
declare(strict_types=1);
// LH-DEPLOY-V1
// Generated during upload; switches release without changing private configuration.
$release = '@@RELEASE@@';
$previous = '@@PREVIOUS@@';
ini_set('display_errors', '0');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: SAMEORIGIN');
header('Cache-Control: no-store');
header('X-LifeHub-Release: ' . $release);

$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
$base = '/umbertini/';
if ($path !== '/umbertini' && !str_starts_with($path, $base)) {
    http_response_code(404);
    exit;
}
$relative = str_starts_with($path, $base) ? substr($path, strlen($base)) : '';
if (str_contains($path, "\0") || str_contains($path, '\\') || preg_match('~(?:^|/)\.~', $path)
    || $relative === 'hosting.php') {
    http_response_code(403);
    exit;
}
if (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') {
    http_response_code(403);
    exit('HTTPS_REQUIRED');
}
if (version_compare(PHP_VERSION, '8.5.6', '<')) {
    http_response_code(503);
    exit('PHP_RUNTIME_UNSUPPORTED');
}
$root = __DIR__ . '/.lh-releases/' . $release;
if (str_starts_with($path, '/umbertini/api/')) {
    try {
        $configPath = require __DIR__ . '/hosting.php';
        $configPath = is_string($configPath) ? realpath($configPath) : false;
        $publicRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '');
        $privateRoot = realpath(__DIR__ . '/.lh-private');
        $privateRules = $privateRoot ? @file_get_contents($privateRoot . '/.htaccess') : false;
        $inside = static fn (string $path, string $directory): bool =>
            $path === $directory || str_starts_with($path, $directory . DIRECTORY_SEPARATOR);
        $allowed = static function (string $path) use ($publicRoot, $privateRoot, $privateRules, $inside): bool {
            if (!$publicRoot || $publicRoot === DIRECTORY_SEPARATOR) { return false; }
            if (!$inside($path, $publicRoot)) { return true; }
            // Shared hosting: this exact directory is denied independently by Apache.
            // Setup and every update must verify HTTP 403 before uploading/activating.
            return $privateRoot && trim((string) $privateRules) === 'Require all denied'
                && $inside($path, $privateRoot);
        };
        if (!$configPath || !$allowed($configPath)) {
            throw new RuntimeException('Protected private configuration required');
        }
        $settings = require $configPath;
        if (!is_array($settings) || ($settings['environment'] ?? null) !== 'production'
            || ($settings['basePath'] ?? null) !== '/umbertini') {
            throw new RuntimeException('Hosting configuration required');
        }
        $storage = realpath($settings['storagePath'] ?? '');
        if (!$storage || !$allowed($storage) || !is_dir($storage) || !is_writable($storage)) {
            throw new RuntimeException('Protected persistent storage required');
        }
        define('LIFEHUB_CONFIG_FILE', $configPath);
        if ($relative === 'api/deployment-health') {
            require $root . '/backend/deployment-health.php';
            exit;
        }
        require $root . '/backend/public/index.php';
    } catch (Throwable $error) {
        http_response_code(503);
        header('Content-Type: application/json; charset=utf-8');
        // Never return paths, database credentials or raw exception messages.
        error_log(json_encode(['event' => 'deployment.runtime_failed', 'release' => $release,
            'errorType' => get_class($error)]));
        echo json_encode(['error' => ['code' => 'hosting.unavailable',
            'message' => 'Applicazione temporaneamente non disponibile.']]);
    }
    exit;
}
$mime = ['js' => 'text/javascript', 'css' => 'text/css', 'svg' => 'image/svg+xml',
    'png' => 'image/png', 'ico' => 'image/x-icon', 'webmanifest' => 'application/manifest+json',
    'woff2' => 'font/woff2'];
if ($relative === 'ngsw.json') { $mime['json'] = 'application/json'; }
$extension = pathinfo($relative, PATHINFO_EXTENSION);
if (isset($mime[$extension])) {
    // Retain one older build for browsers that loaded HTML just before activation.
    foreach (array_filter([$release, $previous]) as $candidateRelease) {
        $assets = realpath(__DIR__ . '/.lh-releases/' . $candidateRelease . '/frontend');
        $file = $assets ? realpath($assets . '/' . $relative) : false;
        if ($file && is_file($file) && str_starts_with($file, $assets . DIRECTORY_SEPARATOR)) {
            header('Content-Type: ' . $mime[$extension]);
            readfile($file);
            exit;
        }
    }
}
if ($relative === 'index.html' || preg_match('~^/umbertini/?(?:tasks|shopping|meals|recipes|inventory|notes|documents|calendars|goals|admin|about|login)?/?$~', $path)) {
    header('Content-Type: text/html; charset=utf-8');
    readfile($root . '/frontend/index.html');
    exit;
}
http_response_code(404);
echo 'Not found';
