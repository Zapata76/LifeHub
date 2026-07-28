<?php

/**
 * Routes the production bundle through PHP's local development server.
 */

declare(strict_types=1);

$releaseRoot = realpath(dirname(__DIR__) . '/.release');
if ($releaseRoot === false) {
    http_response_code(500);
    echo 'Release bundle is missing.';
    return true;
}

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

if ($path === '/') {
    header('Location: /umbertini/', true, 302);
    return true;
}

if ($path === '/__lifehub/reset') {
    header('Content-Type: text/html; charset=UTF-8');
    header('Cache-Control: no-store, max-age=0');
    echo <<<'HTML'
<!doctype html><html lang="it"><meta charset="utf-8"><title>Aggiornamento Life Hub</title>
<body style="font-family:system-ui;background:#0b1120;color:#f8fafc;padding:3rem">
<h1>Aggiornamento locale</h1><p id="status">Rimozione della versione memorizzata…</p>
<script>
Promise.all([
  navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(r => Promise.all(r.map(x => x.unregister()))) : Promise.resolve(),
  window.caches ? caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))) : Promise.resolve()
]).finally(() => {
  document.getElementById('status').textContent = 'Cache aggiornata. Reindirizzamento…';
  location.replace('/umbertini/shopping?updated=' + Date.now());
});
</script></body></html>
HTML;
    return true;
}

if (preg_match('#^/umbertini/(?:src|vendor|bin|ops|storage|config|\.runtime)(?:/|$)#i', $path) === 1
    || preg_match('#^/umbertini/uploads/(?:files|logs)(?:/|$)#i', $path) === 1
    || preg_match('#(?:^|/)\.[^/]*#', $path) === 1
    || preg_match('#(?:^|/)(?:composer\.(?:json|lock)|\.env(?:\..*)?)$#i', $path) === 1
) {
    http_response_code(403);
    echo 'Forbidden.';
    return true;
}

if ($path === '/umbertini/api' || strpos($path, '/umbertini/api/') === 0) {
    require $releaseRoot . '/umbertini/api/index.php';
    return true;
}

$candidate = $releaseRoot . DIRECTORY_SEPARATOR
    . str_replace('/', DIRECTORY_SEPARATOR, ltrim($path, '/'));
$resolved = realpath($candidate);
$releasePrefix = rtrim($releaseRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
if ($resolved !== false
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

if ($path === '/umbertini' || strpos($path, '/umbertini/') === 0) {
    header('Content-Type: text/html; charset=UTF-8');
    readfile($releaseRoot . '/umbertini/index.html');
    return true;
}

http_response_code(404);
echo 'Not found.';
return true;
