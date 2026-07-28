param(
    [Parameter(Mandatory = $true)][string]$MysqldumpPath,
    [string]$ConfigurationFile = (Join-Path $PSScriptRoot '..\api\config\app.php'),
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\.runtime\backups')
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tool = (Resolve-Path -LiteralPath $MysqldumpPath).Path
if (-not $tool.EndsWith('mysqldump.exe', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'MysqldumpPath must identify mysqldump.exe.'
}
$configuration = (Resolve-Path -LiteralPath $ConfigurationFile).Path
$optionWriter = Join-Path $PSScriptRoot 'mysql-client-config.php'
$optionPath = Join-Path ([IO.Path]::GetTempPath()) ("lifehub-mysql-{0}.cnf" -f [Guid]::NewGuid().ToString('N'))
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
try {
    $databaseOutput = @(
        & (Join-Path $root 'tools\php7433.ps1') $optionWriter $configuration $optionPath
    )
    if ($LASTEXITCODE -ne 0) { throw 'Unable to read the application database configuration.' }
    $database = ($databaseOutput -join '').Trim()
    if ($database -notmatch '^[A-Za-z0-9_]+$') { throw 'The configured database name is invalid.' }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $dumpPath = Join-Path $outputRoot ("{0}-{1}.sql" -f $database, $stamp)
    & $tool "--defaults-extra-file=$optionPath" '--default-character-set=utf8' `
        '--lock-tables' '--add-locks' '--quick' '--skip-comments' "--result-file=$dumpPath" $database
    if ($LASTEXITCODE -ne 0) { throw "mysqldump failed with exit code $LASTEXITCODE." }
} finally {
    if (Test-Path -LiteralPath $optionPath) { Remove-Item -LiteralPath $optionPath -Force }
}
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $dumpPath).Hash
$evidence = [ordered]@{
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    database = $database
    file = [IO.Path]::GetFileName($dumpPath)
    bytes = (Get-Item -LiteralPath $dumpPath).Length
    sha256 = $hash
}
$evidencePath = "$dumpPath.json"
$evidence | ConvertTo-Json | Set-Content -LiteralPath $evidencePath -Encoding UTF8
Write-Output ($evidence | ConvertTo-Json -Compress)
