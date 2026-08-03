# Architecture

## Components

```text
Browser / Angular PWA
        |
        | HTTPS, JSON, multipart/form-data
        v
API PHP 8.5 / Slim 4
        |
        +-- MySQL with lh_ tables
        +-- private storage at uploads/files
```

The frontend is compiled as a static PWA. The API exposes the `/api/v1`
contract and handles sessions, authorization, CSRF protection, validation, and
data access.

## Backend

- `api/public/index.php`: HTTP entry point.
- `api/src/Application`: application composition and route registration.
- `api/src/Shared`: authentication, HTTP, persistence, audit, and CRUD
  components.
- `api/src/<Module>`: controllers and repositories for functional modules.
- `api/src/Installation`: schema initialization and first administrator
  creation.
- `api/bin/lifehub`: operational commands.

Queries always include `household_id` when accessing household data. Composite
meal-planning and shopping operations use an application journal with
idempotency keys.

## Frontend

- `web/src/app/core`: session management, guards, and interceptors.
- `web/src/app/features`: module pages and services.
- `web/src/app/app.routes.ts`: lazy-loaded routes.
- `web/src/manifest.webmanifest` and `web/src/icons`: PWA installation assets.

Each functional page is dedicated to its module; no generic CRUD interface is
exposed to users.

## Security

- Passwords stored with bcrypt.
- `HttpOnly`, `SameSite`, and `Secure` session cookies in production.
- CSRF tokens required for state-changing operations.
- Backend role and household-membership checks.
- Security-related HTTP headers.
- Private files are not served directly by Apache.
- Auditing of sensitive actions.
- Login-attempt rate limiting.

## Configuration

Application configuration resides in `api/config/app.php`, which is excluded
from Git. It contains the URL base path, environment, database, session, site
title, and storage settings. The version-controlled template is
`api/config/app.example.php`.

## Build and release

`ops/build-release.ps1`:

1. validates the configuration;
2. builds Angular into `web/dist/lifehub`;
3. prepares a release path derived from `basePath`;
4. copies the API, Apache rules, and configuration;
5. installs production-only PHP dependencies;
6. prepares protected private storage.
