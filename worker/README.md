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
