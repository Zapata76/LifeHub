param(
    [switch]$WithDatabaseIntegration,
    [switch]$WithDependencyAudit
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$api = Join-Path $root 'api'
$web = Join-Path $root 'web'
$results = [ordered]@{}

function Invoke-Gate([string]$Name, [scriptblock]$Command) {
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "Gate '$Name' failed with exit code $LASTEXITCODE." }
    $results[$Name] = 'PASS'
}

Push-Location $api
try {
    Invoke-Gate 'runtime' { & (Join-Path $root 'tools\php7433.ps1') 'bin\lifehub' 'runtime:check' }
    Invoke-Gate 'composer-validate' { & (Join-Path $root 'tools\composer.ps1') 'validate' '--strict' }
    if ($WithDependencyAudit) {
        Write-Warning 'Composer audit contacts the configured package repository and sends dependency metadata.'
        Invoke-Gate 'composer-audit' { & (Join-Path $root 'tools\composer.ps1') 'audit' '--format=json' }
    } else {
        $results['composer-audit'] = 'NOT_RUN'
    }
    Invoke-Gate 'phpcs' {
        & (Join-Path $root 'tools\php7433.ps1') 'vendor\squizlabs\php_codesniffer\bin\phpcs' '--standard=phpcs.xml'
    }
    Invoke-Gate 'phpstan' {
        & (Join-Path $root 'tools\php7433.ps1') 'vendor\phpstan\phpstan\phpstan' 'analyse' `
            '--configuration=phpstan.neon' '--no-progress' '--memory-limit=512M'
    }
    if ($WithDatabaseIntegration) { $env:LIFEHUB_TEST_DB = '1' }
    Invoke-Gate 'phpunit' {
        & (Join-Path $root 'tools\php7433.ps1') 'vendor\phpunit\phpunit\phpunit' '--configuration=phpunit.xml'
    }
} finally {
    Pop-Location
}

Push-Location $web
try {
    if ($WithDependencyAudit) {
        Write-Warning 'npm audit contacts the npm registry and sends dependency metadata.'
        Invoke-Gate 'npm-audit-high' { npm audit '--audit-level=high' }
    } else {
        $results['npm-audit-high'] = 'NOT_RUN'
    }
    Invoke-Gate 'angular-test' { npm test }
    Invoke-Gate 'angular-build' { npm run build }
} finally {
    Pop-Location
}

$results['generatedAt'] = (Get-Date).ToUniversalTime().ToString('o')
$results | ConvertTo-Json
