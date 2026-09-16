# Task completion push notifications

The bell in the application header opens per-device notification settings.
Each user must explicitly enable notifications on every browser/device they
want to receive them on. No permission prompt is displayed automatically.
HTTPS and a supported browser/service worker are required. On iPhone/iPad,
use iOS/iPadOS 16.4 or newer and launch the app installed on the Home Screen.

## Delivery rules

- A successful transition from `open` or `in_progress` to `completed` sends
  notifications to every registered device of the other active users in the
  same household. Both the completion button and the task editor use this rule.
- Retrying completion or editing an already-completed task does not send
  another notification. Reopening and completing it again does.
- The actor's devices are excluded. Users without permission to read a task
  receive a generic completion message, without its title or actor's name.
- Tapping the notification opens the task board; normal login/authorization
  rules still apply. Task titles may appear on the device's lock screen.
- Explicit logout removes this device's server registration and browser
  subscription. Session expiry alone leaves the opt-in active. A different
  account on the same browser must opt in again. Password/security changes
  revoke delivery until a new authenticated visit refreshes the registration.

Delivery uses encrypted standard Web Push with VAPID, directly from PHP;
there is no new cron job and no dependency on the daily-email job. Compatible
hosting needs PHP cURL/OpenSSL (including P-256 support), mbstring and outbound
HTTPS to Google, Mozilla, Apple or Microsoft browser push services. TLS
verification remains enabled and redirects are disabled. Unknown push-service
hosts are rejected to prevent arbitrary outbound requests/SSRF.

Sends are best-effort, in batches of 50 with concurrency 10 and an eight-second
timeout per request. Saving a task does not fail when push delivery fails.
There is no background retry queue: a failed send is logged, not replayed on
a later task save. Accepted notifications have a one-hour TTL while devices
are offline; acceptance is not proof of display (OS/browser settings can
suppress notifications). Expired subscriptions (HTTP 404/410) are removed.

## Configuration and deployment

1. Apply the `lh_push_subscriptions` definition from `database/lifehub.sql`, or
   export that new table from the local database to production. It uses MyISAM,
   an endpoint-hash unique key and a household/user index. No migration files
   are needed; do not run `db:init` against an existing installation.
2. Generate VAPID keys **once**, using the local/private configuration:

   ```powershell
   .\tools\php859.ps1 .\api\bin\lifehub push:keys .\api\config\app.php
   .\tools\php859.ps1 .\api\bin\lifehub push:check .\api\config\app.php
   ```

   Keys are written to `storagePath/push-vapid.php` without being printed.
   Generation refuses to overwrite an existing key file. Keep a private backup.
   The VAPID contact defaults to `publicUrl` (a public HTTPS URL), or set
   `pushVapidSubject` to a `mailto:address@example.com` contact or HTTPS URL.
3. Deploy the complete release including its new `vendor` dependencies and
   `.htaccess`. Copy the generated private key file to the production
   `storagePath/push-vapid.php` (normally `umbertini/uploads/push-vapid.php`).
   The supplied `.htaccess` blocks HTTP access to that file. Never put keys in
   the frontend, Git, an API response, screenshots or logs.
4. Preserve that same key file across releases. Changing keys invalidates
   existing device subscriptions. The normal release build does not regenerate
   or package private runtime files: retain production uploads when deploying.
5. Transfer build files in binary mode and publish `ngsw.json` last.

Missing or invalid optional push configuration disables the feature rather
than breaking `app-config`, login or task saving. Authenticated
`GET api/v1/push/config` reports `enabled` and the **public** key only.
`push:check` reports configuration/extension availability without secrets.

## Production check

Enable the bell option for user B on two devices; background/close the app on
one. As user A, complete an activity. B should receive it on both devices, A
on neither. Tap the notification and verify that the task board opens. Save
the same completed task again: there should be no new notification. Finally,
log B out on one device and repeat with another task: only B's remaining
subscribed device should receive it.

The PHP error log contains aggregate `push.delivery` JSON events with a
correlation ID, route, duration, sent/failed/expired counts and a stable error
code. It never contains task text, names, keys or subscription URLs. These
counts describe push-service responses, not device delivery receipts.

References: [Angular SwPush](https://angular.dev/ecosystem/service-workers/push-notifications),
[PHP Web Push](https://github.com/web-push-libs/web-push-php),
[WebKit iOS support](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
