param(
    [Parameter(Mandatory = $true)][string]$MysqlPath,
    [Parameter(Mandatory = $true)][string]$BackupPath,
    [Parameter(Mandatory = $true)][string]$TargetDatabase,
    [string]$ConfigurationFile = (Join-Path $PSScriptRoot '..\api\config\app.php')
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ($TargetDatabase -notmatch '^lh_restore_[a-z0-9_]{4,48}$') {
    throw 'TargetDatabase must use the isolated lh_restore_* prefix.'
}
$tool = (Resolve-Path -LiteralPath $MysqlPath).Path
$backup = (Resolve-Path -LiteralPath $BackupPath).Path
$configuration = (Resolve-Path -LiteralPath $ConfigurationFile).Path
$optionWriter = Join-Path $PSScriptRoot 'mysql-client-config.php'
$optionPath = Join-Path ([IO.Path]::GetTempPath()) ("lifehub-mysql-{0}.cnf" -f [Guid]::NewGuid().ToString('N'))
$sourceCommand = 'source ' + ($backup -replace '\\', '/')
try {
    & (Join-Path $root 'tools\php7433.ps1') $optionWriter $configuration $optionPath | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to read the application database configuration.' }
    & $tool "--defaults-extra-file=$optionPath" '--default-character-set=utf8' `
        "--execute=CREATE DATABASE $TargetDatabase DEFAULT CHARACTER SET utf8"
    if ($LASTEXITCODE -ne 0) { throw 'Unable to create the isolated restore database.' }
    $started = Get-Date
    & $tool "--defaults-extra-file=$optionPath" '--default-character-set=utf8' `
        "--database=$TargetDatabase" "--execute=$sourceCommand"
    if ($LASTEXITCODE -ne 0) { throw 'The isolated restore failed.' }
} finally {
    if (Test-Path -LiteralPath $optionPath) { Remove-Item -LiteralPath $optionPath -Force }
}
[ordered]@{
    restoredAt = (Get-Date).ToUniversalTime().ToString('o')
    targetDatabase = $TargetDatabase
    sourceSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $backup).Hash
    elapsedSeconds = [math]::Round(((Get-Date) - $started).TotalSeconds, 2)
} | ConvertTo-Json
