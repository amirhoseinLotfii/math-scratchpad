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

The Worker mirrors answer-like events into the existing Math Attempts source and updates the existing canonical Sessions source. It also maintains the new Mistakes, Concepts, and Daily Reports sources under the Math project. It does not write to the workspace Events database, which is paused. Test events are marked with both Data Mode = Test and isTest = true; they may appear in Attempts/Sessions for verification but do not affect live concept or daily projections. Events whose isTest field is missing or not boolean are quarantined: they are skipped by Notion writes and their cursor is advanced without creating rows. The status reports the cumulative quarantined count.

The source identifiers are non-secret bindings in wrangler.jsonc. The Notion integration key is not in the repository. After the Notion integration exists, share only these five sources with it: Math Attempts, Sessions, Mistakes, Concepts, and Daily Reports. Then add the key directly to Cloudflare Worker Secrets:

    npx wrangler secret put NOTION_API_KEY --config worker/wrangler.jsonc

The authenticated API exposes GET /notion/status and POST /notion/sync. The status returns only a safe state, pending event count, last successful sync time, and a sanitized error code. Manual sync handles a bounded group of five events, and a Durable Object alarm continues queued events. Notion requests are serialized with a 350 ms minimum interval (under three requests per second); 429 and server errors use bounded retries. Each successful event advances a durable cursor, so a partial failure resumes without creating duplicate rows.

Until NOTION_API_KEY is configured, /notion/status reports not_configured and /notion/sync returns 503. Do not mark the Notion mirror as live until a tagged test answer appears in the Attempts source and its linked session is verified. Do not put a Notion key in code, frontend configuration, logs, or chat.

## Private Google Drive mirror (P0-4)

When configured, the Durable Object mirrors the complete event stream to the owner's private Drive:

- `Math_Project/03_Sync/events/events_YYYY-MM.jsonl` — one full validated event per line, grouped by UTC month.
- `Math_Project/03_Sync/state/progress.json` — current chapter, lesson, section and chunk, gate state, completion, unlocked sections, bank version, and last event/sequence.
- `Math_Project/03_Sync/sync_manifest.json` — last sequence/event, UTC and Tehran timestamps, and SHA-256 hashes for event and progress files.

The Worker stores new mirror writes as immutable, content-addressed snapshots. Each snapshot filename includes the SHA-256 of its exact UTF-8 content. Before creating one, it checks for the same name; an existing snapshot is reused only after its content is read back and verified. A newly created snapshot is also read back and hash-checked. Duplicate names or a content/hash mismatch fail closed. The manifest records the latest snapshot file ID, filename, and hash for each logical path.

Legacy files with mutable logical names may be read during migration but are not overwritten or deleted. This avoids relying on ETags from Drive media responses for concurrency control. Weekly backup retries keep a stable creation timestamp so they can find the same verified snapshot after a lost upload response. Identical canonical event sets remain idempotent; different content produces a different snapshot name. Events without a boolean `isTest` value are quarantined and excluded from event JSONL, progress projections, and weekly backup snapshots.



The OAuth refresh token must belong to the configured `OWNER_EMAIL` and have the `drive.file` and `userinfo.email` scopes. Set the OAuth consent screen to **In production** so the refresh token does not expire after the Testing-mode seven-day limit. Obtain the token in the owner's Google browser flow, then add it directly to Cloudflare Worker Secrets; never paste it into source files, shell history, issues, or chat:

```sh
npx wrangler secret put GOOGLE_DRIVE_CLIENT_SECRET --config worker/wrangler.jsonc
npx wrangler secret put GOOGLE_DRIVE_REFRESH_TOKEN --config worker/wrangler.jsonc
```

The prompts accept secret values without adding them to the repository. Until both secrets are present, `/drive/status` reports `not_configured` and `/drive/sync` returns `503`. In the 2026-11-04 production verification, the configured personal account was confirmed, one synthetic `isTest: true` event was written and read back from an immutable Drive snapshot, and the manifest hash matched. Secret values were not read or exposed.


## Production verification — 2026-11-04

The existing Worker was deployed with the immutable-snapshot Drive implementation after its exact source commit passed the full CI gate and build. A synthetic event with `isTest: true` was synced once. Drive media read-back matched the SHA-256 in the content-addressed filename, and the manifest referenced that same snapshot and hash. The corresponding Notion Attempt and linked Session were read back with `Data Mode=Test`. The app reported zero pending queues. The Notion `Data Check` formula result was not exposed by the connected query tool and remains unverified. The live weekly backup artifact/read-back and a real legacy-data migration remain separate checks.
