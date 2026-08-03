<#
.SYNOPSIS
Runs a PHP command with the exact Life Hub PHP 8.5.9 runtime.
#>

[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $PhpArguments
)

$ErrorActionPreference = 'Stop'
$phpExecutable = 'C:\tools\php859\php.exe'

if (-not (Test-Path -LiteralPath $phpExecutable -PathType Leaf)) {
    throw "Required PHP executable not found: $phpExecutable"
}

$version = & $phpExecutable -r 'echo PHP_VERSION;'
if ($LASTEXITCODE -ne 0 -or $version -ne '8.5.9') {
    throw "Expected PHP 8.5.9, found '$version' at $phpExecutable"
}

$requiredExtensions = @('fileinfo', 'json', 'mbstring', 'pdo_mysql', 'session')
$moduleOutput = & $phpExecutable -m
if ($LASTEXITCODE -ne 0) {
    throw 'Unable to read PHP modules.'
}

foreach ($requiredExtension in $requiredExtensions) {
    if ($moduleOutput -notcontains $requiredExtension) {
        throw "Required PHP extension is not loaded: $requiredExtension"
    }
}

& $phpExecutable @PhpArguments
exit $LASTEXITCODE
