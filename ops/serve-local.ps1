param(
    [ValidateRange(1024, 65535)][int]$Port = 8080
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$php = 'C:\tools\php7433\php.exe'
$releaseRoot = Join-Path $root '.release'
$router = Join-Path $PSScriptRoot 'local-router.php'

if (-not (Test-Path -LiteralPath $php -PathType Leaf)) {
    throw "PHP 7.4.33 was not found at $php."
}
if (-not (Test-Path -LiteralPath (Join-Path $releaseRoot 'umbertini\index.html') -PathType Leaf)) {
    throw 'Release bundle is missing. Run ops\build-release.ps1 first.'
}
if (-not (Test-Path -LiteralPath $router -PathType Leaf)) {
    throw 'The local router is missing.'
}

Write-Host "Life Hub: http://127.0.0.1:$Port/umbertini/"
Write-Host "Health probe: http://127.0.0.1:$Port/umbertini/api/health"
Write-Host 'Press Ctrl+C to stop the local server.'

Push-Location $root
try {
    & $php -S "127.0.0.1:$Port" -t $releaseRoot $router
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
