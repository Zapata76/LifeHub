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

### Optional sessionless diagnostic probe

`GET /api/v1/diagnostics/probe` (under the configured base path) is dispatched before
the regular application factory and session middleware. It is disabled by default
(404). It is not advertised to or called by the frontend. An unguessable URL is not
used as authentication: HTTPS and a dedicated `X-LifeHub-Probe-Token` header are required.

Activation after deploying the code:

1. Run `python ops/probe.py --init` locally. This creates an ignored
   `.local/diagnostic-probe-token` without overwriting an existing token and prints
   only its SHA-256 hash. Keep the local token private; do not paste it in chat, URLs,
   command arguments, source control or screenshots.
2. In the protected production `.lh-private/config.php`, set `diagnosticProbeTokenHash`
   to that hash and `diagnosticProbeHouseholdId` to the intended household's numeric ID.
   Do not reuse the notification-job token. No database/schema changes are needed.
3. Run `python ops/probe.py` for one sample, or
   `python ops/probe.py --samples 10 --interval 65` for a short series.
   The client verifies TLS, refuses redirects, sends no cookies and prints only
   status, UTC timestamp, total duration, diagnostic timing and correlation headers.
4. Disable by clearing `diagnosticProbeTokenHash`. To rotate, replace both the local
   token and its server-side hash. Private configuration is preserved by deployment.

The probe performs exactly three fixed, indexed, bounded SELECTs (up to 100 rows
each) scoped to the configured household: task status/priority/due date, shopping
item status/product reference, and meals in the next seven UTC calendar days. No
titles, descriptions, attachments or user records are selected. Small PHP grouping,
sorting and serialization are performed and discarded. The response contains only
`ok`, a fixed diagnostic `code`, and `correlationId`; no real records or counts.
This is a representative sample, not an exact replay of a full Dashboard query.

Headers and sanitized `diagnostic.probe` logs expose `early_php`, `db_connect`,
`tasks_read`, `shopping_read`, `meals_read`, `calculation`, `response_encoding`,
and `php_total` in milliseconds. Read phases include prepare/execute/fetch; the
total includes other diagnostic overhead and is not a sum to add to those phases.
`early_php` starts at the deployed front controller's first timer, including config
and autoload work before the probe. PHP-worker queueing, execution before that
timer, response transmission and browser/network delays remain outside `php_total`.
No PHP session is opened, so this does not reproduce a particular user's session lock.

There is one nonblocking filesystem slot per installation, held through the DB
work, and at least 60 seconds between starts (429 with `Retry-After: 60`). Failed
attempts after authorization also consume the slot. Missing/unwritable gate storage
fails closed (503). The only persistent writes are a timestamp in
`storagePath/diagnostic-probe.lock` and diagnostic logs, never application DB rows.
Keep that storage outside public access, as required for normal operation.

Bounded reads still consume resources and can contend with MyISAM writes. There is
no portable hard SQL execution deadline across supported hosting configurations:
a client timeout does not guarantee the server stopped the query. The held lock
prevents concurrent probe workloads; do not bypass it during an investigation.

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

### Weekly email recap

Task email is sent on **Saturday from 06:00 Europe/Rome**, including daylight saving
time. The authenticated notification endpoint also enforces this window; calls on
other weekdays or before 06:00 return HTTP 200 with `outsideWeeklyWindow: 1` and
send nothing. No session or CSRF token is needed; the dedicated job token is required.

Each active, non-archived user with a valid email receives their own non-archived
open/in-progress tasks (earliest due date first, undated last, with priorities) and
the completed tasks of everyone in their household. Completed tasks cover the
previous Saturday at 06:00 inclusive through this Saturday at 06:00 exclusive,
ordered by completion time descending. This cutoff stays fixed during retries.
Archived completed tasks are included; permanently deleted tasks, reopened tasks
and tasks without a completion timestamp cannot appear. Users with no pending tasks
still receive household completions; entirely empty task recaps are skipped.
Existing meals for the next seven days and weather for the sending day remain included.

No schema change or migration is required. `lh_task_notification_deliveries` keeps
the existing history and uses the Saturday date as the weekly delivery key. A sent
recap is not sent again on retries; failed recipients may be retried on the same
Saturday. This retains the existing SMTP delivery semantics: there is no atomic
transaction between mail acceptance and marking a delivery as sent.

The shared scheduler is in the separate `data-auto-acquisition-scripts` repository.
After deploying LifeHub, upload `dailyJobs.php`, `lifehub-notifications-job.php` and
`lifehub-job.php` to the hosting scripts directory. LifeHub's `update.ps1` does not
deploy that repository. Keep `lifehub-job.local.php` and its current token unchanged.
The existing external job must invoke `dailyJobs.php` **at 06:00 on Saturdays**;
the script sends on the first invocation at or after 06:00, not via a background
timer. Preserve the other scheduler ticks needed by AlignGarden Push and Finviz.
Invoking the old job only at 08:00 would send the recap at 08:00 instead.

The runner uses `.runtime/lifehub-weekly-task-notifications.json` with a nonblocking
lock and records successful Saturdays. The former daily state file is ignored and
may remain on disk. The read-only `lifehub-job.php` dashboard shows the weekly
period, recipient/task counts, `sentThisWeek`, `failedThisWeek`, last delivery and
next scheduled cutoff. Counts reflect current database contents, not a saved copy
of the email. After a successful weekly run, new recipients/tasks wait until next week.

### Dashboard weather

The dashboard displays today's forecast for the same household location configured
in Admin for the weekly email. Any authenticated household member can read it via
`GET /api/v1/weather/today`; changing or disabling the location remains admin-only
and applies to both dashboard and email. No additional configuration or database
changes are needed. With no location configured, the dashboard hides the card.

Weather loads separately from dashboard metrics, using the existing Open-Meteo
client and Europe/Rome calendar day. The private runtime stores one
`weather-<householdId>.json` cache file per household for 30 minutes, with a 60-second
failure cache. A new day or a settings version change invalidates it. A nonblocking
lock avoids simultaneous provider requests; unavailable forecasts are shown as such,
never replaced with yesterday's data. If runtime storage is unwritable, the request
still attempts a forecast without caching. The frontend refreshes while visible
after 30 minutes, on a new Italian date, and when returning to the app if due.
The new API retains the normal authentication/session-expiry behavior. Only the
backend contacts the forecast provider; no browser geolocation permission is needed.
