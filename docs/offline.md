# Offline updates and emergency controls

This runbook covers the service worker, safe application updates, and the controls
that turn offline behavior off. The app's learning data remains in browser storage;
the controls below remove only app-owned caches and service-worker registrations.

## Normal update flow

The app and service worker receive the same build identity from `VITE_BUILD_SHA`,
`GITHUB_SHA`, or the local Git commit. The worker reports that identity and its
minimum required learning-data schema to open app tabs.

When a compatible worker is ready, the status chip shows **نسخهٔ جدید**. The user
can keep editing with **بعداً**, or choose **بارگذاری دوباره**. The initiating tab
flushes the current session, learning-storage writes, and pending outbox writes to
local browser storage before it asks the waiting worker to activate. This does not
force a cloud sync. Only the initiating tab reloads. Other open tabs continue using
their current shell; the previous shell cache stays until those tabs report a newer
build or close.

Workers that require a schema newer than the app supports are not activated. The
current supported schema is `1` in `src/pwa/update-contract.ts`; the worker's
minimum is set in `scripts/build-sw.mjs`. Change these values only alongside a
reviewed data migration and compatibility plan.

Update checks run at startup, when connectivity returns, when a visible tab has
been idle for at least ten minutes, and hourly while visible. The status dialog
also has **بررسی نسخهٔ جدید** for a manual check. Update activation reports an
error in the dialog if the controller does not change within 15 seconds; the local
write flush has already completed, so the user can retry.

## Turn offline support off remotely

Set the static file `public/pwa-control.json` to:

```json
{ "swEnabled": false }
```

On every online page start, the app requests this file with `cache: no-store` and
a unique query parameter before registering the worker. Configure the host or CDN
to return the file without caching when that option is available. A false value
unregisters service workers scoped to this app, deletes caches whose names start
with `ms-`, and reloads at most once in the current browser session. Browser
learning data in IndexedDB and local storage is retained. When the file is missing,
unavailable, or invalid, the app leaves the worker enabled; this keeps offline use
available during a temporary control-file outage.

To restore offline support, set `swEnabled` to `true` and publish the file. A
previously disabled page registers the worker on its next online load.

This remote control requires a network connection to read the file. It cannot
change an already-offline page until that page reconnects.

## Local escape hatch

Append `?no-sw=1` to an in-scope app URL, for example
`https://example.com/math-scratchpad/?no-sw=1`. The app unregisters its scoped
workers and deletes only `ms-` caches while preserving browser learning data. The
query is a local override for that page load; remove it to allow normal registration
again when the remote control file enables the worker.

## Emergency `KILL=1` worker build

Use this for a worker-only emergency response when a new static build is being
prepared. First build the app normally, then build the worker with an explicit
release identity and the kill flag:

```sh
VITE_BUILD_SHA=release-sha npm run build
BUILD_SHA=release-sha KILL=1 node scripts/build-sw.mjs dist
```

Replace `release-sha` with the same release identifier in both commands.

Deploy the resulting static build through the normal reviewed release process. The
worker advertises `killSwitch: true`; compatible app tabs then unregister the app's
worker scope, remove `ms-` caches, and navigate to the `?no-sw=1` escape hatch. This
path does not delete learning records or session data. It is not a server-side data
reset and does not change the Cloudflare Worker, Notion, Google Drive, or GitHub.

When the incident is resolved, rebuild with `KILL` unset (or `KILL=0`) and publish
`{"swEnabled":true}` in `pwa-control.json` if the remote control had been disabled.

## Local verification

Build three isolated worker variants and run the update and kill-switch flows in
mobile and laptop Chromium projects:

```sh
node scripts/build-offline-test-versions.mjs
PW_PREBUILT=1 PAGES_TEST_DIST=dist-a npx playwright test \
  --config=playwright.offline.config.ts \
  e2e/offline/sw-update.offline.spec.ts \
  e2e/offline/kill-switch.offline.spec.ts \
  --workers=1
```

These browser scenarios block requests to external origins and use synthetic
sentinel data. They confirm that the worker controls are scoped to `ms-` caches and
that the sentinel local-storage and IndexedDB records survive. They do not inspect
or modify a real user's browser profile.
