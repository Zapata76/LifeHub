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

The bundle location and local URL are derived from `basePath`. The empty
default produces `.release/lifehub` and is served at
`http://127.0.0.1:8080/`. A nested path such as `/apps/family/lifehub`
produces `.release/apps/family/lifehub` and is served at the matching URL.

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
  -SourceDirectory C:\path\to\lifehub\uploads
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
[DEPLOY_PRODUCTION.txt](../DEPLOY_PRODUCTION.txt).

## API latency and session locks

### Regular API timing

Protected routes release the PHP session after authentication and CSRF checks,
before controller work and attachment streaming. Public login, logout and session
bootstrap retain write access until their changes have been saved. A finalizer also
closes the session on rejected requests and exceptions. Closing is not logout:
the session cookie, stored user and CSRF token remain valid.

Do not write to `$_SESSION` inside protected controllers after this boundary;
such changes would not persist. If a future endpoint needs session mutation, place
it explicitly before the release boundary, as with the auth endpoints.

API responses handled by the middleware expose `Server-Timing`. In browser DevTools,
open Network, select the network request (not only the service worker wrapper),
then inspect Timing or the response headers. The same metrics are in the JSON
PHP error log under `timings_ms`, alongside `correlation_id`, route and status:

- `db_connect`: opening PDO and configuring the connection; zero with an injected PDO.
- `bootstrap`: application factory setup, excluding connection time.
- `session_start`: `session_start()` duration, including lock wait, session I/O and
  possible PHP session garbage collection. It is not a pure lock-wait measurement.
- `authentication`: session validation and login/logout logic, excluding SQL and JSON encoding.
- `db_query`: cumulative PDO prepare, execute, query and exec calls, including failed
  calls and SQL used by authentication. Uses the instrumented connection from PdoFactory;
  an externally injected plain PDO is not measured. With buffered MySQL results, server
  execution and result transfer occur here; PHP fetch/hydration remains in processing
  (or authentication when reading the authenticated user).
- `response_encoding`: JSON serialization and writing the response buffer, not network transfer.
- `processing`: remaining middleware/controller work, including data aggregation,
  session persistence and external services. Excludes all separately measured phases.
- `app_total`: sum of those stages; also reported as `duration_ms` in request logs.

Phase durations are exclusive: SQL and JSON time nested inside authentication is
subtracted from authentication, avoiding double counting. Totals can differ by a
few hundredths of a millisecond due to rounding. SQL text and parameters are never
retained. The request-local collector is reset even after failures.

Values are milliseconds and contain no user identifiers, cookie values, SQL or
credentials. Timings are also attached to handled 401/403/404/500 responses.
They do not include server/PHP-worker queue time, code loading before the factory,
network transfer or response-body streaming. Bootstrap failures before middleware
installation cannot produce these headers. Static assets and `ngsw.json` are not
API requests and do not receive these API metrics.

A large `session_start` indicates session opening/lock contention; a large
`db_connect` points to connection setup. A short `app_total` with long browser
waiting time points outside the measured application stages. Correlate a slow
request using `X-Correlation-ID` rather than collecting cookies or credentials.
