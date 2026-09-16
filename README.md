# Life Hub

## Structure

- `api/`: modular PHP 8.5 API, CLI, and tests.
- `database/lifehub.sql`: complete MySQL 5.0/MyISAM schema.
- `web/`: Angular PWA.
- `ops/`: build, local server, backup, restore, and release gate scripts.
- `deploy/`: Apache rules and private storage protection.
- `tools/`: wrappers for PHP 8.5.9 and Composer.
- `docs/`: functional specification, architecture, database, and operations.

## Local requirements

The authoritative PHP runtime is:

```text
C:\tools\php859\php.exe
```

Production requires PHP 8.5.6 or later within the PHP 8.5 series.

MySQL, Composer, and Node.js/npm are also required.

## Configuration

Copy `api/config/app.example.php` to `api/config/app.php`, which is excluded
from Git, and configure the URL base path, database, application title,
session, and storage. The application does not use `.env` files or web server
environment variables.

Set `basePath` to `''` when Life Hub is installed at the domain root. For a
nested installation, use the complete URL path without a trailing slash, for
example `/apps/family/lifehub`. Each segment may contain letters, numbers,
periods, underscores, tildes, and hyphens. The API is always exposed below the
same path at `<basePath>/api`.

Install the locked dependencies:

```powershell
.\tools\composer.ps1 install --working-dir=api
Set-Location web
npm ci
Set-Location ..
```

## Weather in daily notification emails

In **Admin → Meteo di oggi**, search for a town and select a result, or enter a
custom name and latitude/longitude. Save the location to enable weather for
the household; **Disattiva meteo nelle email** removes it. Only administrators
can read or change this setting.

The daily email includes today's weather (using the household time zone),
minimum/maximum temperature and precipitation probability. Meal plans still
cover seven days, including today. Recipients remain active users with an
email address and assigned open/in-progress tasks. Weather does not trigger
additional emails. Missing forecasts never prevent task/meal notifications.

Forecasts and town search use [Open-Meteo](https://open-meteo.com/), whose free
API is for non-commercial use and needs no API key. The backend needs outbound
HTTPS access to `api.open-meteo.com` and `geocoding-api.open-meteo.com`, using
PHP cURL or HTTPS streams (`allow_url_fopen`). TLS verification remains enabled;
Windows cURL uses the native certificate store. Forecast requests time out
after eight seconds and are shared across recipients in the same household
during each job execution.

The setting uses the nullable `weather_name`, `weather_latitude`,
`weather_longitude` fields and independent `weather_version` in `lh_households`.
The baseline schema and local database include these fields. Existing production
databases must include them before publishing the updated Admin interface;
no migration scripts are generated.

## First installation

Create an empty database with the UTF-8 character set and configure it in
`api/config/app.php`. From the repository root, verify and apply the schema:

```powershell
.\tools\php859.ps1 .\api\bin\lifehub db:init:dry-run .\api\config\app.php
.\tools\php859.ps1 .\api\bin\lifehub db:init .\api\config\app.php
```

`db:init` applies the baseline only to an empty database and rejects databases
that already contain `lh_` tables.

Then create the first household, the first administrator, and the primary
shopping list:

```powershell
.\tools\php859.ps1 .\api\bin\lifehub admin:create `
  .\api\config\app.php `
  "Administrator" `
  "PASSWORD-AT-LEAST-12-CHARACTERS" `
  "Family" `
  "Europe/Rome"
```

The password is passed as a process argument: run the command in a private
terminal, remove it from the command history, and change it through the
interface after the first login.

Verify the installation:

```powershell
.\tools\php859.ps1 .\api\bin\lifehub db:inspect .\api\config\app.php
.\tools\php859.ps1 .\api\bin\lifehub integrity .\api\config\app.php
```

## Quality

```powershell
.\ops\release-readiness.ps1
.\ops\release-readiness.ps1 -WithDatabaseIntegration
```

The database-enabled variant creates and removes only temporary schemas with
the `lh_probe_` prefix.

## Build and local server

```powershell
.\ops\build-release.ps1
.\ops\serve-local.ps1
```

The local server prints the exact application and health-probe URLs derived
from `basePath`.

For a root installation the build is generated in the ignored
`.release/lifehub` directory. A nested path such as `/apps/family/lifehub`
produces `.release/apps/family/lifehub`. Private blobs are stored in the
bundle's protected `uploads/files` directory.

For complete deployment instructions, see
[DEPLOY_PRODUCTION.txt](DEPLOY_PRODUCTION.txt). Project documentation is
indexed in [docs/README.md](docs/README.md).

## Sessions and PWA updates

For opt-in notifications on task completion, private VAPID key setup and
deployment checks, see [Push notifications](docs/PUSH_NOTIFICATIONS.md).

Protected API routes check authentication before CSRF: expired or revoked
sessions return `401`, while an invalid CSRF token for an active session
returns `403`. The frontend clears its local session and redirects to login
with an explicit expiry message. It also rechecks the session when returning
to the app. A network error alone never triggers a logout. A CSRF rejection
rechecks the session and refreshes the token, but never replays a write.

The PWA checks for updates at startup, on resume/reconnect and every two
minutes while visible and online. A ready version triggers a full reload
when no request, edited form or dialog is active; otherwise a banner lets
the user save changes before updating. Offline use necessarily retains the
last downloaded version. Logout does not delete service-worker caches.

Deploy the complete release, including `.htaccess`, `index.html`, JavaScript,
CSS and service-worker files. Publish `ngsw.json` last, after its referenced
assets are available; retain previous hashed JavaScript files during rollout
so existing clients can still load lazy routes. Apache revalidates the entry
page, update manifest, worker and CSS; online navigations prefer the network.
Already-installed older clients must first load this release to gain its
resume/update handling and may need one close/reopen or manual reload.

## License

Life Hub is free and open-source software distributed under the terms of the
[GNU Affero General Public License v3.0](LICENSE).
