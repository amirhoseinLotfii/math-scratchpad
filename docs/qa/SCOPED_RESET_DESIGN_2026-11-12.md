# Scoped learning reset — staged implementation contract (2026-11-12)

Status: **design + pure classification tests only; NOT READY FOR MERGE OR PRODUCTION**.
Base commit: `59913b8fb45bfe07ca2f31614efb1843b2b5569d` (the deployed PR #91 code).
Branch: `feature/scoped-learning-reset`; this branch must remain isolated from production.

## 1. Objective and non-goals

Allow an authenticated owner to reset one chapter or one lesson without erasing any other learning records, question bank, sign-in sessions, application credentials, another project's Notion rows, or any unrelated Drive content. The reset includes direct answers **and derived side effects**, not just event rows. The existing global reset remains unchanged.

The current commit deliberately adds only a pure parser/classifier plus unit tests. It does **not** expose an API, delete data, alter mirror cursors, change a client epoch, or claim an end-to-end pass.

## 2. Identity and scope contract

Minimum safe internal scope (stricter than the original UI sketch):

- Chapter: `{ "type": "chapter", "id": "1", "bankVersion": "v21" }`
- Lesson: `{ "type": "lesson", "id": "1.1", "chapter": 1, "bankVersion": "v21" }`

Reason: `LearnEvent` has `chapter: number`, `lesson: string` and `bankVersion: string`. A bare lesson ID is not guaranteed unique across chapters and bank revisions. Before implementation verify the bank's canonical lesson-to-chapter mapping; never trust arbitrary client scope assertions. Current parser deliberately rejects extra fields and invalid IDs.

`classifyScopedLearningEvent` returns `preserve | remove | rebuild` and **does not execute deletion**. `remove` is a candidate set for the later plan, not authorization to run SQL DELETE. Legacy migration payloads, chapter snapshots affected by a lesson reset, and shared session/report events require semantic replay.

## 3. Required read-only preview before execute

A preview must report verifiable, itemized counts with stable identifiers:
- DO: targeted event IDs and shared session IDs; related `app_state` keys and the exact fields to rewrite; projections and queue rows to rebuild.
- Google Drive: per-file ID, parent folder, integrity hash, direct deletions vs mixed-file rewrites. Include `03_Sync/events`, `03_Sync/state`, `06_Backups`, manifests and immutable snapshot revisions. Never trash a mixed file.
- Notion: Attempts and Mistakes page IDs; Math-only Sessions to update/rebuild; Daily Reports and Concepts whose derived counts change. Separately identify Pomodoro Sessions and never modify them.
- Browser: affected IndexedDB records, localStorage keys, reading-position anchors, outbox, editor state and cached projections; preserve unrelated work.
- Report `unknown` for anything that has not been inspected. If any shared record cannot be safely reconciled, `canExecute: false`.

Do not publish a preview reporting estimated numbers as exact numbers. Re-read state/revisions immediately before execution.

## 4. Execution protocol (not yet implemented)

Proposed endpoints:
- `GET /reset/preview?type=lesson&id=1.1&chapter=1&bankVersion=v21` (owner session; dry-run only).
- `POST /admin/learning-reset/scoped` (separate admin secret, explicit confirmation string, UUID v4 `resetId`, validated scope).
- `GET /admin/learning-reset/scoped/status?resetId=...` and a safe release/abort path.

Use a durable journal keyed by `resetId` and canonical scope. Persist `phase`, cursors, per-item completion markers, source revision and error code. Return 202 for incomplete batches. Duplicated calls with the same `resetId` must be idempotent, and conflicting IDs for the same scope must get 409. Never hold an in-memory-only lock as the source of truth.

Stages:
1. Validate scope against a trusted bank mapping and freeze only affected writes; wait for already-active writes.
2. Inventory all destinations and record a stable preview/revision.
3. Make reproducible replacement projections and mirror content from the **surviving events**, not by decrementing counters. Preserve globally shared records (cross-lesson sessions, daily totals, Concepts) and recompute them.
4. Reconcile Notion pages by ownership markers, preserve Pomodoro and unrelated sessions; perform upserts/deletions with a resumable journal.
5. Rewrite only affected Drive JSON/JSONL files and immutable snapshots using conditional revision/ETag guards; keep integrity hashes consistent; handle 404/trashed files.
6. Commit DO changes and repair `notion_projections`, `notion_page_refs`, queue metadata and mirror cursor/high-water marks **without relying on contiguous sequence numbers** after deletion.
7. Bump a **per-scope** generation and return it on read APIs. Reject queued/stale writes originating from an old generation (409 or 426); client must selectively purge the old scope before any queue flush.
8. Unlock the scope only after all required destinations and client safety gates are satisfied; retain a sanitized audit trail.

A cross-service reset is a **saga**, not an atomic SQL transaction. Explicitly support interruption and safe retry between each remote API operation; never commit partial completion as success.

Stay below Cloudflare Free's documented/observed 50 subrequest limit per Worker invocation, including paginated listings, file metadata, Drive writes and Notion requests; leave headroom and use bounded continuation.

## 5. Known blockers to full implementation

- `learning_events` is append-only with `seq`-based mirror cursors; selective physical deletion would invalidate naive incremental projection/mirror logic.
- `app_state` contains mixed learning state; a naïve key-level delete can erase other lessons. Client-local caches have the same issue.
- `chapter_snapshot` and `legacy_state_migration` can embed other lessons and require decode/rebuild.
- Notion Sessions and Daily Reports represent aggregates; a one-lesson delete must rebuild surviving counts while preserving Pomodoro's records in the shared Sessions data source.
- Drive mirror files and backups can be multi-scope and content-addressed. Blind trashing is not safe.
- No executable authenticated mobile/desktop E2E session was available in this environment. The connected Kernel browser's create action returned 403 (payment method required); local sandbox cannot resolve GitHub.

## 6. Acceptance / test matrix (pending)

1. Two lessons in one chapter; reset one; the other survives all destinations.
2. Two chapters with repeated lesson IDs; only exact chapter+bankVersion matches.
3. Same lesson ID from different bankVersion preserved.
4. Reset scope with a mixed Notion Session; remove math contributions, retain Pomodoro and other lessons.
5. Reset lesson while chapter snapshot and legacy migration data exist; recompute safely.
6. Mixed JSONL/manifest/backups on Drive; rewrite selected records, preserve hashes/other events.
7. Offline clients with stale pending events cannot resurrect erased records.
8. Two tabs and two devices; scope locks, stale epochs, interrupted reconnection.
9. Retry after partial Notion or Drive success, 429, 5xx, timeout and worker subrequest budget; no duplicates.
10. Two competing resetIds; one blocked; same resetId resumable.
11. All existing Worker tests, app tests, TypeScript checks, build, desktop Chromium E2E and Pixel 7/Chrome Android emulation pass, with HAR/console screenshots.
12. Global reset routes, bank source, Google session, other Notion projects and all non-math Drive files remain unchanged.

## 7. Release gates

- No production deploy, merge, live data deletion or real credential rotation from this branch.
- Do not change or rotate secrets just for testing.
- Before any destructive staging run: make a verified restorable backup, choose synthetic isolated fixtures and record the restore procedure.
- When the entire implementation and evidence are available, request explicit approval before production.

## 8. Distinct issue under investigation: Google sign-in

`src/sync/google-id-token.ts:150–180` starts `google.accounts.id.prompt()` and throws `Google account sign-in timed out` at 30 seconds if the ID credential callback does not arrive. `src/sync/google-auth.ts:51–70` runs the ID One Tap flow in parallel with the Drive OAuth token flow. Thus successful Drive authorization alone cannot satisfy the separate ID credential request. This **proves the error's throw site but not the browser-specific causal trigger**; trace One Tap prompt notifications, popup blocking, COOP and cookies before selecting a fix. Keep that work on its own separate PR.

## 9. Cron investigation

`worker/src/index.ts:251–259` throws if a scheduled mirror request is unsuccessful or if Drive/Notion reports `status: error`; `scheduled` dispatches every five minutes. Cloudflare has the `*/5 * * * *` trigger configured. This identifies an exception path, not the original underlying mirror error. Diagnose from sanitized mirror state and actual invocation traces; avoid claiming a definite third-party root cause until verified.
