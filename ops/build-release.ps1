param(
    [string]$OutputDirectory = '',
    [string]$ConfigurationFile = (Join-Path $PSScriptRoot '..\api\config\app.php')
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$allowedRoot = [IO.Path]::GetFullPath((Join-Path $root '.release'))
$configurationPath = [IO.Path]::GetFullPath($ConfigurationFile)
if (-not (Test-Path -LiteralPath $configurationPath -PathType Leaf)) {
    throw "Application configuration file is missing: $configurationPath"
}
$configurationOutput = & (Join-Path $root 'tools\php859.ps1') `
    (Join-Path $root 'api\bin\lifehub') 'config:check' $configurationPath
if ($LASTEXITCODE -ne 0) { throw 'Application configuration validation failed.' }
$configuration = ($configurationOutput -join "`n") | ConvertFrom-Json
$configurationOutput
$basePath = [string]$configuration.basePath
$baseHref = [string]$configuration.webPath
if ($OutputDirectory -eq '') {
    $releaseRelativePath = if ($basePath -eq '') {
        'lifehub'
    } else {
        $basePath.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)
    }
    $OutputDirectory = Join-Path $allowedRoot $releaseRelativePath
}
$releaseRoot = [IO.Path]::GetFullPath($OutputDirectory)
$allowedPrefix = $allowedRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $releaseRoot.StartsWith($allowedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Release output must stay below .release.'
}
Push-Location (Join-Path $root 'web')
try { npm run build -- "--base-href=$baseHref" } finally { Pop-Location }
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
Copy-Item -LiteralPath (Join-Path $root 'deploy\storage.htaccess') `
    -Destination (Join-Path $releaseRoot 'uploads\files\.htaccess')
Copy-Item -LiteralPath (Join-Path $root 'api\composer.json') -Destination $releaseRoot
Copy-Item -LiteralPath (Join-Path $root 'api\composer.lock') -Destination $releaseRoot
& (Join-Path $root 'tools\composer.ps1') 'install' "--working-dir=$releaseRoot" '--no-dev' '--classmap-authoritative' '--no-interaction'
if ($LASTEXITCODE -ne 0) { throw 'Production Composer install failed.' }
$files = Get-ChildItem -LiteralPath $releaseRoot -Recurse -File
[ordered]@{
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    files = $files.Count
    bytes = ($files | Measure-Object Length -Sum).Sum
    composerLockSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $releaseRoot 'composer.lock')).Hash
} | ConvertTo-Json
