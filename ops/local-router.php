<?php

/**
 * Routes the production bundle through PHP's local development server.
 */

declare(strict_types=1);

$configuredReleaseRoot = getenv('LIFEHUB_LOCAL_RELEASE_ROOT');
$releaseRoot = is_string($configuredReleaseRoot) ? realpath($configuredReleaseRoot) : false;
if ($releaseRoot === false || !is_file($releaseRoot . '/index.html')) {
    http_response_code(500);
    echo 'Release bundle is missing.';
    return true;
}

$configuredBasePath = getenv('LIFEHUB_LOCAL_BASE_PATH');
$basePath = is_string($configuredBasePath) ? $configuredBasePath : '';
$baseSegments = explode('/', ltrim($basePath, '/'));
if (
    $basePath !== ''
    && (preg_match('#^/[A-Za-z0-9._~-]+(?:/[A-Za-z0-9._~-]+)*$#', $basePath) !== 1
        || in_array('.', $baseSegments, true)
        || in_array('..', $baseSegments, true))
) {
    http_response_code(500);
    echo 'Invalid local base path.';
    return true;
}
$webPath = $basePath === '' ? '/' : $basePath . '/';

$uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (!is_string($uriPath)) {
    http_response_code(400);
    echo 'Invalid request path.';
    return true;
}

$path = rawurldecode(str_replace('\\', '/', $uriPath));
$segments = explode('/', $path);
if (strpos($path, "\0") !== false || in_array('..', $segments, true)) {
    http_response_code(400);
    echo 'Invalid request path.';
    return true;
}

if ($basePath !== '' && ($path === '/' || $path === $basePath)) {
    header('Location: ' . $webPath, true, 302);
    return true;
}

if ($path === '/__lifehub/reset') {
    $shoppingPath = json_encode(
        $basePath . '/shopping',
        JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
            | JSON_THROW_ON_ERROR
    );
    header('Content-Type: text/html; charset=UTF-8');
    header('Cache-Control: no-store, max-age=0');
    echo <<<HTML
<!doctype html><html lang="it"><meta charset="utf-8"><title>Aggiornamento Life Hub</title>
<body style="font-family:system-ui;background:#0b1120;color:#f8fafc;padding:3rem">
<h1>Aggiornamento locale</h1><p id="status">Rimozione della versione memorizzata…</p>
<script>
const serviceWorkerReset = navigator.serviceWorker
  ? navigator.serviceWorker.getRegistrations().then(r => Promise.all(r.map(x => x.unregister())))
  : Promise.resolve();
Promise.all([
  serviceWorkerReset,
  window.caches ? caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))) : Promise.resolve()
]).finally(() => {
  document.getElementById('status').textContent = 'Cache aggiornata. Reindirizzamento…';
  location.replace({$shoppingPath} + '?updated=' + Date.now());
});
</script></body></html>
HTML;
    return true;
}

if ($basePath === '') {
    $relativePath = $path;
} elseif (strpos($path, $webPath) === 0) {
    $relativePath = substr($path, strlen($basePath));
} else {
    http_response_code(404);
    echo 'Not found.';
    return true;
}

if (
    preg_match('#^/(?:src|vendor|bin|ops|storage|config|\.runtime)(?:/|$)#i', $relativePath) === 1
    || preg_match('#^/uploads/files(?:/|$)#i', $relativePath) === 1
    || preg_match('#(?:^|/)\.[^/]*#', $relativePath) === 1
    || preg_match('#(?:^|/)(?:composer\.(?:json|lock)|\.env(?:\..*)?)$#i', $relativePath) === 1
) {
    http_response_code(403);
    echo 'Forbidden.';
    return true;
}

if ($relativePath === '/api' || strpos($relativePath, '/api/') === 0) {
    require $releaseRoot . '/api/index.php';
    return true;
}

$candidate = $releaseRoot . DIRECTORY_SEPARATOR
    . str_replace('/', DIRECTORY_SEPARATOR, ltrim($relativePath, '/'));
$resolved = realpath($candidate);
$releasePrefix = rtrim($releaseRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
if (
    $resolved !== false
    && is_file($resolved)
    && strpos($resolved, $releasePrefix) === 0
) {
    if (strtolower((string) pathinfo($resolved, PATHINFO_EXTENSION)) === 'webmanifest') {
        header('Content-Type: application/manifest+json; charset=UTF-8');
        header('Cache-Control: no-cache, must-revalidate');
        readfile($resolved);
        return true;
    }
    return false;
}

header('Content-Type: text/html; charset=UTF-8');
readfile($releaseRoot . '/index.html');
return true;
