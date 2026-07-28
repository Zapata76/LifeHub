# Operations

## Dependencies

```powershell
.\tools\composer.ps1 install --working-dir=api
Set-Location web
npm ci
Set-Location ..
```

## Quality checks

```powershell
.\ops\release-readiness.ps1
.\ops\release-readiness.ps1 -WithDatabaseIntegration
.\ops\release-readiness.ps1 -WithDatabaseIntegration -WithDependencyAudit
```

The gate covers the PHP runtime, Composer, PHPCS, PHPStan, PHPUnit, Angular
tests, and the production build. Database tests use temporary schemas with the
`lh_probe_` prefix exclusively.

## Build and local server

```powershell
.\ops\build-release.ps1
.\ops\serve-local.ps1
```

The bundle is written to `.release/umbertini` and served locally at
`http://127.0.0.1:8080/umbertini/`.

## Database backup

The script reads the connection settings from `api/config/app.php` and does not
require a password in environment variables:

```powershell
.\ops\backup-database.ps1 `
  -MysqldumpPath C:\path\to\mysql\bin\mysqldump.exe `
  -ConfigurationFile .\api\config\app.php
```

The dump, checksum, and metadata are stored in `.runtime/backups`.

## Storage backup

```powershell
.\ops\backup-uploads.ps1 `
  -SourceDirectory C:\path\to\umbertini\uploads
```

The ZIP archive and its hash are stored outside the source directory.

## Restore test

```powershell
.\ops\restore-isolated.ps1 `
  -MysqlPath C:\path\to\mysql\bin\mysql.exe `
  -BackupPath .\.runtime\backups\lifehub.sql `
  -TargetDatabase lh_restore_test `
  -ConfigurationFile .\api\config\app.php
```

The target database name must begin with `lh_restore_`. The procedure does not
overwrite the configured database.

## Production

The complete procedure, including private storage, permissions, publishing, and
smoke testing, is documented in
[DEPLOY_PRODUZIONE.txt](../DEPLOY_PRODUZIONE.txt).
