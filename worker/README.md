# Math Scratchpad sync Worker

This Worker is the server-side event log for the single Math Scratchpad owner. It uses a SQLite Durable Object named from the verified owner email. The object stores the validated schema-v1 learning event exactly once by event ID and assigns an increasing sequence number.

## Local checks

Run the Cloudflare Workers integration tests against Miniflare and the SQLite Durable Object:

```sh
npm run test:worker
npm run worker:build
```

The Worker integration suite also runs in `npm run test:gate`. The normal project build runs the Wrangler dry-run bundle check.

## Deploy

The deploy target is configured in `wrangler.jsonc`; it contains only public application configuration (Pages origin, owner email, Google OAuth client ID, and rate limit). It contains no credentials or secrets.

After Cloudflare CLI authentication is available, deploy with:

```sh
npx wrangler deploy --config worker/wrangler.jsonc
```

Cloudflare account authentication is required for that command. Do not put Cloudflare tokens, Google tokens, or passwords in this repository. Future private integration credentials must be added using Cloudflare Worker Secrets.

## API

The browser sends a Google **ID token** as `Authorization: Bearer <id-token>`. The Worker verifies the signature against Google's rotating JWKS, the RS256 algorithm, issuer, audience, expiry, authorized party, and verified email. Only `amirhoseinlotfalizadeprogramer@gmail.com` is accepted. Tokens and event payloads are never logged. Requests with an `Origin` header are accepted only from `https://amirhoseinlotfii.github.io`; CORS does not allow credentials.

All data routes require that bearer token:

### `POST /events`

```json
{
  "events": [
    {
      "id": "00000000-0000-4000-8000-000000000001",
      "schema": 1,
      "ts": "2026-11-02T00:00:00.000Z",
      "deviceId": "00000000-0000-4000-8000-000000000002",
      "bankVersion": "v21",
      "session": "session-id",
      "chapter": 1,
      "lesson": "1.1",
      "section": "1.1",
      "concept": "concept-id",
      "type": "lesson_open"
    }
  ]
}
```

The request accepts 1–50 events (maximum 250 KB) and validates each one with the app's shared `learnEventSchema`. Retrying an identical ID and payload returns its original sequence. Reusing an ID with different content returns `409 event_id_conflict`; the entire batch is rolled back.

### `GET /sync?cursor=0&limit=100`

Returns events with `seq > cursor`, in sequence order. `through` is a high-water mark for a stable pagination pass. Continue with the returned `cursor` and `through` until `hasMore` is false:

```json
{
  "events": [{ "seq": 1, "event": { "schema": 1 } }],
  "cursor": 1,
  "through": 4,
  "hasMore": true
}
```

### `GET /snapshot?limit=100`

Returns a paginated replay snapshot of the append-only event log, with a fixed `snapshotCursor` high-water mark. When continuing, send both the returned `cursor` and `snapshotCursor` as `cursor` and `through`. Events appended after the first page are excluded from that snapshot and can be fetched later through `/sync`.

### `GET /health`

Public readiness check. Returns `{ "ok": true, "service": "math-scratchpad-sync" }` and does not expose account or storage details.

The authenticated data routes use a per-owner fixed-window request limit of 120 requests per minute by default. A test-only Miniflare binding sets the limit to 5 to verify the `429` response without changing the deploy configuration.

## Private Notion mirror (P0-5)

The Worker mirrors answer-like events into the existing Math Attempts source and updates the existing canonical Sessions source. It also maintains the new Mistakes, Concepts, and Daily Reports sources under the Math project. It does not write to the workspace Events database, which is paused. Test events are marked with both Data Mode = Test and isTest = true; test events do not affect live concept or daily projections.

The source identifiers are non-secret bindings in wrangler.jsonc. The Notion integration key is not in the repository. After the Notion integration exists, share only these five sources with it: Math Attempts, Sessions, Mistakes, Concepts, and Daily Reports. Then add the key directly to Cloudflare Worker Secrets:

    npx wrangler secret put NOTION_API_KEY --config worker/wrangler.jsonc

The authenticated API exposes GET /notion/status and POST /notion/sync. The status returns only a safe state, pending event count, last successful sync time, and a sanitized error code. Manual sync handles a bounded group of five events, and a Durable Object alarm continues queued events. Notion requests are serialized with a 350 ms minimum interval (under three requests per second); 429 and server errors use bounded retries. Each successful event advances a durable cursor, so a partial failure resumes without creating duplicate rows.

Until NOTION_API_KEY is configured, /notion/status reports not_configured and /notion/sync returns 503. Do not mark the Notion mirror as live until a tagged test answer appears in the Attempts source and its linked session is verified. Do not put a Notion key in code, frontend configuration, logs, or chat.

## Private Google Drive mirror (P0-4)

When configured, the Durable Object mirrors the complete event stream to the owner's private Drive:

- `Math_Project/03_Sync/events/events_YYYY-MM.jsonl` — one full validated event per line, grouped by UTC month.
- `Math_Project/03_Sync/state/progress.json` — current chapter, lesson, section and chunk, gate state, completion, unlocked sections, bank version, and last event/sequence.
- `Math_Project/03_Sync/sync_manifest.json` — last sequence/event, UTC and Tehran timestamps, and SHA-256 hashes for event and progress files.

The Worker creates or reuses these app-owned folders and files. It does not call Drive's permissions or delete endpoints; new files inherit the owner's private Drive access. Small files use conditional ETag writes. A `412` response triggers a read, an event-ID merge, and up to three retries. Files over 5 MB use Drive's resumable upload protocol while keeping the ETag condition. Partial failures retain the last successful file checkpoints and retry after one minute. Normal event sync is queued for five seconds after the event arrives.

The OAuth refresh token must belong to the configured `OWNER_EMAIL` and have the `drive.file` and `userinfo.email` scopes. Set the OAuth consent screen to **In production** so the refresh token does not expire after the Testing-mode seven-day limit. Obtain the token in the owner's Google browser flow, then add it directly to Cloudflare Worker Secrets; never paste it into source files, shell history, issues, or chat:

```sh
npx wrangler secret put GOOGLE_DRIVE_CLIENT_SECRET --config worker/wrangler.jsonc
npx wrangler secret put GOOGLE_DRIVE_REFRESH_TOKEN --config worker/wrangler.jsonc
```

The prompts accept secret values without adding them to the repository. Until both secrets are present, `/drive/status` reports `not_configured` and `/drive/sync` returns `503`. After configuring secrets, verify the returned account is the owner and confirm one `isTest: true` learner event is visible in Drive before relying on the mirror. Do not run that live check until the owner approves the Cloudflare and Google OAuth steps.
