param(
    [Parameter(Mandatory = $true)][string]$SourceDirectory,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\.runtime\backups')
)

$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath $SourceDirectory).Path
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
if ($outputRoot.StartsWith($source, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The upload backup must be written outside the source tree.'
}
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$archive = Join-Path $outputRoot ("uploads-{0}.zip" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
Compress-Archive -Path (Join-Path $source '*') -DestinationPath $archive -CompressionLevel Optimal
[ordered]@{
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    file = [IO.Path]::GetFileName($archive)
    bytes = (Get-Item -LiteralPath $archive).Length
    sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash
} | ConvertTo-Json
