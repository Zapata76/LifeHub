param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\.release\umbertini'),
    [string]$ConfigurationFile = (Join-Path $PSScriptRoot '..\api\config\app.php')
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$releaseRoot = [IO.Path]::GetFullPath($OutputDirectory)
$allowedRoot = [IO.Path]::GetFullPath((Join-Path $root '.release'))
if (-not $releaseRoot.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Release output must stay under .release.'
}
$configurationPath = [IO.Path]::GetFullPath($ConfigurationFile)
if (-not (Test-Path -LiteralPath $configurationPath -PathType Leaf)) {
    throw "Application configuration file is missing: $configurationPath"
}
& (Join-Path $root 'tools\php7433.ps1') (Join-Path $root 'api\bin\lifehub') 'config:check' $configurationPath
if ($LASTEXITCODE -ne 0) { throw 'Application configuration validation failed.' }
Push-Location (Join-Path $root 'web')
try { npm run build } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'Angular production build failed.' }
if (Test-Path -LiteralPath $releaseRoot) { Remove-Item -LiteralPath $releaseRoot -Recurse -Force }
New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
Copy-Item -Path (Join-Path $root 'web\dist\lifehub\browser\*') -Destination $releaseRoot -Recurse
Copy-Item -LiteralPath (Join-Path $root 'deploy\.htaccess') -Destination (Join-Path $releaseRoot '.htaccess')
Copy-Item -Path (Join-Path $root 'api\public') -Destination (Join-Path $releaseRoot 'api') -Recurse
Copy-Item -Path (Join-Path $root 'api\src') -Destination (Join-Path $releaseRoot 'src') -Recurse
New-Item -ItemType Directory -Path (Join-Path $releaseRoot 'config') -Force | Out-Null
Copy-Item -LiteralPath $configurationPath -Destination (Join-Path $releaseRoot 'config\app.php')
New-Item -ItemType Directory -Path (Join-Path $releaseRoot 'uploads\files') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $releaseRoot 'uploads\logs') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $root 'deploy\storage.htaccess') `
    -Destination (Join-Path $releaseRoot 'uploads\files\.htaccess')
Copy-Item -LiteralPath (Join-Path $root 'deploy\storage.htaccess') `
    -Destination (Join-Path $releaseRoot 'uploads\logs\.htaccess')
Copy-Item -LiteralPath (Join-Path $root 'api\composer.json') -Destination $releaseRoot
Copy-Item -LiteralPath (Join-Path $root 'api\composer.lock') -Destination $releaseRoot
& (Join-Path $root 'tools\composer.ps1') 'install' "--working-dir=$releaseRoot" '--no-dev' '--classmap-authoritative'
if ($LASTEXITCODE -ne 0) { throw 'Production Composer install failed.' }
$files = Get-ChildItem -LiteralPath $releaseRoot -Recurse -File
[ordered]@{
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    files = $files.Count
    bytes = ($files | Measure-Object Length -Sum).Sum
    composerLockSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $releaseRoot 'composer.lock')).Hash
} | ConvertTo-Json
