<#
.SYNOPSIS
Runs the verified project Composer PHAR with PHP 8.5.9.
#>

[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $ComposerArguments
)

$ErrorActionPreference = 'Stop'
$composerPhar = 'C:\tools\php859\composer.phar'
$phpWrapper = Join-Path $PSScriptRoot 'php859.ps1'
$projectRoot = Split-Path -Parent $PSScriptRoot
$composerCache = Join-Path $projectRoot '.runtime\composer-cache'

if (-not (Test-Path -LiteralPath $composerPhar -PathType Leaf)) {
    throw "Verified Composer PHAR not found: $composerPhar"
}

if (-not (Test-Path -LiteralPath $composerCache -PathType Container)) {
    New-Item -ItemType Directory -Force -Path $composerCache | Out-Null
}

$env:COMPOSER_CACHE_DIR = $composerCache

& $phpWrapper $composerPhar @ComposerArguments
exit $LASTEXITCODE
