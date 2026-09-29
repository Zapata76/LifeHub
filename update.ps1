param([switch]$PrepareOnly, [switch]$CheckConnection, [switch]$Rollback, [switch]$VerifyLibraries, [string]$TlsHost = '')
$ErrorActionPreference = 'Stop'
$arguments = @((Join-Path $PSScriptRoot 'ops\update.py'))
if ($PrepareOnly) { $arguments += '--prepare-only' }
if ($CheckConnection) { $arguments += '--check-connection' }
if ($Rollback) { $arguments += '--rollback' }
if ($VerifyLibraries) { $arguments += '--verify-libraries' }
if ($TlsHost) { $arguments += @('--tls-host', $TlsHost) }
& python @arguments
exit $LASTEXITCODE
