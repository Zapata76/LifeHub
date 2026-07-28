param(
    [ValidateRange(1024, 65535)][int]$Port = 8080,
    [string]$ConfigurationFile = (Join-Path $PSScriptRoot '..\api\config\app.php')
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$php = 'C:\tools\php7433\php.exe'
$releaseBase = Join-Path $root '.release'
$router = Join-Path $PSScriptRoot 'local-router.php'

if (-not (Test-Path -LiteralPath $php -PathType Leaf)) {
    throw "PHP 7.4.33 was not found at $php."
}
$configurationPath = [IO.Path]::GetFullPath($ConfigurationFile)
$configurationOutput = & (Join-Path $root 'tools\php7433.ps1') `
    (Join-Path $root 'api\bin\lifehub') 'config:check' $configurationPath
if ($LASTEXITCODE -ne 0) { throw 'Application configuration validation failed.' }
$configuration = ($configurationOutput -join "`n") | ConvertFrom-Json
$basePath = [string]$configuration.basePath
$webPath = [string]$configuration.webPath
$releaseRelativePath = if ($basePath -eq '') {
    'lifehub'
} else {
    $basePath.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)
}
$releaseRoot = Join-Path $releaseBase $releaseRelativePath
if (-not (Test-Path -LiteralPath (Join-Path $releaseRoot 'index.html') -PathType Leaf)) {
    throw 'Release bundle is missing. Run ops\build-release.ps1 first.'
}
if (-not (Test-Path -LiteralPath $router -PathType Leaf)) {
    throw 'The local router is missing.'
}

$documentRoot = if ($basePath -eq '') { $releaseRoot } else { $releaseBase }
$env:LIFEHUB_LOCAL_BASE_PATH = $basePath
$env:LIFEHUB_LOCAL_RELEASE_ROOT = $releaseRoot
Write-Host "Life Hub: http://127.0.0.1:$Port$webPath"
Write-Host "Health probe: http://127.0.0.1:$Port$basePath/api/health"
Write-Host 'Press Ctrl+C to stop the local server.'

Push-Location $root
try {
    & $php -S "127.0.0.1:$Port" -t $documentRoot $router
    exit $LASTEXITCODE
} finally {
    Pop-Location
    Remove-Item Env:LIFEHUB_LOCAL_BASE_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:LIFEHUB_LOCAL_RELEASE_ROOT -ErrorAction SilentlyContinue
}
