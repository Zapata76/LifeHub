# Life Hub

## Structure

- `api/`: modular PHP 7.4.33 API, CLI, and tests.
- `database/lifehub.sql`: complete MySQL 5.0/MyISAM schema.
- `web/`: Angular PWA.
- `ops/`: build, local server, backup, restore, and release gate scripts.
- `deploy/`: Apache rules and private storage protection.
- `tools/`: wrappers for PHP 7.4.33 and Composer.
- `docs/`: functional specification, architecture, database, and operations.

## Local requirements

The authoritative PHP runtime is:

```text
C:\tools\php7433\php.exe
```

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

## First installation

Create an empty database with the UTF-8 character set and configure it in
`api/config/app.php`. From the repository root, verify and apply the schema:

```powershell
.\tools\php7433.ps1 .\api\bin\lifehub db:init:dry-run .\api\config\app.php
.\tools\php7433.ps1 .\api\bin\lifehub db:init .\api\config\app.php
```

`db:init` applies the baseline only to an empty database and rejects databases
that already contain `lh_` tables.

Then create the first household, the first administrator, and the primary
shopping list:

```powershell
.\tools\php7433.ps1 .\api\bin\lifehub admin:create `
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
.\tools\php7433.ps1 .\api\bin\lifehub db:inspect .\api\config\app.php
.\tools\php7433.ps1 .\api\bin\lifehub integrity .\api\config\app.php
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

## License

Life Hub is free and open-source software distributed under the terms of the
[GNU Affero General Public License v3.0](LICENSE).
