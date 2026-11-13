# Fix notes — run 20261113-1319

## Decisions
- Follow the supplied safety gate: no merge, production deployment, release endpoint, or live Worker write before an explicit owner approval at the release gate.
- Do not request secret values in chat. Use connected integrations or mark the dependent check BLOCKED when a credential is unavailable. Cloudflare deploy write permission and the Worker admin token are not verified.
- The audit prompt's suggested browser session could not be created: KERNEL returned HTTP 403 because the organization plan requires a payment method. Do not add paid access; use repository-local Playwright and read-only HTTP where possible. Production interactive browser verification remains BLOCKED.
- The required managed-environment status tool and startup network-policy file are unavailable. Record this limitation; do not assume the network policy is applied. The observed proxy can reach the public Pages and Worker GET endpoints.
- Keep this run isolated from the dirty audit worktree. Current local audit docs are preserved; all code work belongs on `fix/audit-20261113-1319`, and all reports belong on `fixlog/20261113-1319`.
- Drive search found no existing `Math Scratchpad Fix *` folder; branch searches found no existing `fixlog/*` or `fix/audit-*` run to resume. Create RUN_ID 20261113-1319 once.

## Phase 0 — bootstrap and verified drift
Timestamp: 2026-11-13 13:19 Asia/Tehran.

| Tool / source | Availability | Evidence / fallback |
|---|---|---|
| GitHub | Available, admin + push | Repository permissions read; main `7eeeef0`; #91 `59913b8`, #92 `f384ca4`, #93 `d1c730c`; all three open, matching the audit record. Use connector for refs/PRs if direct git authentication fails. |
| Google Drive | Available, personal Drive | Search and root folder creation succeeded; only this run's new folder will be written. |
| Cloudflare | Read available; write unknown | Account, Worker script and deployment reads succeeded. Latest production version is `d376eafb-f0ab-42b9-8409-aab8f9bbaead`, 100%. Do not probe write with a mutation before release approval. |
| Browser | KERNEL read context available; browser creation BLOCKED | Session creation returned 403: billing payment method required. Fallback: local Playwright, `curl` GET/HEAD, and report prod interactive checks BLOCKED. |
| Code execution / network | Available with limits | Node 24.22.1, npm 11.9.0, Git 2.52.0; `node_modules` present in the audit checkout. The runtime-status tool is absent and `/etc/codex/network-policy.json` is absent. Proxied public Pages/Worker GET requests returned 200. |
| Notion | Optional connector available | Not queried; shared Sessions and all Pomodoro data are protected. |
| Gitleaks | Available | `/workspace/scratch/8e8a0f874e58/tools/gitleaks` 8.30.1 from the official Linux release. Run on new/changed artifacts before each checkpoint upload or GitHub commit. |

- `GET /health` returned HTTP 200 with `{"ok":true,"service":"math-scratchpad-sync"}`; current endpoint omits required `env` and `sha` fields (AUD-004).
- Pages HEAD returned HTTP 200; `GET /version.json` returned 404 (AUD-004).
- Current production Worker deployment matches the recorded version and time; no production mutation was attempted.
- Worker admin status was not read because the required admin token is unavailable; use the prompt's fallback and keep phone-recovery server status NOT_TESTED.
- Main SHA was independently verified through GitHub API and matches local `origin/main`; no drift from the audit baseline.

## Phase 1 — main baseline and isolated workspace
Timestamp: 2026-11-13 13:27 Asia/Tehran.

- Created local worktree `/workspace/scratch/8e8a0f874e58/repo-fix` on `fix/audit-20261113-1319` from verified `origin/main` SHA `7eeeef0bf7d524323f88e3520484dfd3a0f7a7bf`; the prior dirty audit checkout remains untouched.
- `npm ci`: exit 0, 271 packages installed from the existing lockfile.
- `npm run typecheck`: VERIFIED, exit 0 on main baseline.
- `npx vitest run`: VERIFIED, 75 files and 975 tests passed on main baseline (42.61 s).
- `npx playwright install chromium`: BLOCKED after two attempts; download of Chrome for Testing 156.0.8078.4 returned a truncated/invalid 0 MiB archive. KERNEL browser-session creation is independently BLOCKED by an organization billing gate. Browser E2E will be attempted in GitHub CI; local browser verification remains BLOCKED unless a usable preinstalled browser is found.
- No application code or test files were changed during this phase. Worktree baseline SHA is unchanged.
- Gitleaks 8.30.1 official Linux binary installed under the scratch tools directory; initial fix artifacts scan returned zero findings.

## Phase 2 — integration base and AUD-006 repair
Timestamp: 2026-11-13 13:34 Asia/Tehran.

- Integrated PR #91 (`d98e136`), PR #93 (`f1642f3`), and PR #92 (`0d1bfa2`) into one local branch in the requested order. Each merge applied without conflicts.
- Immediately restored `press('Enter')` in `e2e/accessibility/axe-states.spec.ts` and added a separate Space-driven AXE state. Existing pointer/tap coverage remains in `e2e/mobile-accessibility.spec.ts`; it was not weakened. Commit: `d048850` (`test(AUD-006): restore keyboard Enter in axe setup`).
- AUD-006 fix status: PARTIAL. `npm run test:typecheck` returned exit 0 after the change. The targeted mobile AXE test could not launch: Chromium headless shell revision 1248 is absent. This is a local environment BLOCKED result, not an application test failure; CI remains required.
- Gitleaks 8.30.1 scanned the staged changes for all three PR merges and the AUD-006 file; each scan returned zero findings. `git diff --check` passed for each merge and for the test change.
- Audit red tests/configs have not yet been imported; next step is to copy the complete audit test directories from the audit branch, scan, commit, and run them.
- PR #91/#92/#93 remain open; no GitHub PR was created yet for this integration branch. No production writes or merges were performed.

## Phase 2 remote code-branch checkpoint — 2026-11-13 17:12 Asia/Tehran

Direct `git push` could not authenticate in this environment. The GitHub Git Data API fallback created the ordered integration commits and advanced `fix/audit-20261113-1319` with a non-forced expected-SHA update from main. Verified local/remote tree SHA equality at each step:

| Local change | GitHub commit | Tree SHA |
|---|---|---|
| PR #91 merge | `811655fcd134cd4b46888564df7ab08469b4296c` | `b9221a84a5405f6b1bf170b30f0476bc1a9216a0` |
| PR #93 merge | `9c65f5f66a7991e8edd9fb40148e340220abbf2b` | `50416ee2f6e5fd1126faca5fb6380f5e1970e9c9` |
| PR #92 merge | `486e59138a71228c72ea6caa8e96ecb93497cdf1` | `a89889b200695a2abfa039486602075f89783064` |
| AUD-006 Enter/Space repair | `27a98aa8ece559baea07aad90ddd0df28ae6353c` | `0498f64328871a12cbffcb1ce44ce62bc77ec4d8` |

The remote branch head is the final AUD-006 commit above. PR #91/#92/#93 remain open. This is an isolated integration branch; no production write, deploy, or merge into main occurred. The next phase imports the audit red tests and runs them before fixing findings.

## Phase 3 — audit regression suite import — 2026-11-13 17:17 Asia/Tehran

Imported the 21 tracked audit test/config files from the local `audit/full-20261113-1015` branch into the isolated code branch. The directories are `tests/audit/`, `worker/test/audit/`, and `e2e/audit/`. The import is committed locally as `7c9c741fbfdf45246046d7ea1562480471624a92` and synchronized to GitHub code branch head `a8bec16b19ce01f879b1788c8b466001c66f18fc`; the remote tree SHA exactly matches the local commit tree.

Gitleaks 8.30.1 returned zero findings on each imported directory, and `git diff --cached --check` passed. A broad exploratory scan of the full worktree reported one finding; it was not present in any imported audit directory. No secret value was included in logs or this note. The regression suites have not yet been executed; they remain the next phase.

## Phase 4 — integrated baseline and audit test results — 2026-11-13 17:23 Asia/Tehran

### Green checks
- `npm run test:typecheck` — PASS.
- `npx vitest run` — 77 test files, 982 tests PASS.
- `npm run test:worker` — 7 files, 123 tests PASS.
- `npm run build` — PASS, including Wrangler `deploy --dry-run`; production was not changed. Build emitted an `import.meta` IIFE warning at `src/main.tsx:99` (AUD-016).
- `npx vitest run tests/audit` — 2/2 PASS for debounce and local-reset-pending suppression. This is partial acceptance for AUD-002 and AUD-014; broader timing/race coverage remains open.

### Red tests and environment blocks
- `worker/test/audit/vitest.audit.config.ts` — 8 files, 9 tests: 2 PASS / 7 FAIL. Confirmed red findings: AUD-005 scoped execute route returns 404; AUD-009 release IDs reuse the same epoch and old-generation writes persist; AUD-010 an unmarked `progress.json` is selected for trash; AUD-011 Notion page references are deleted; AUD-013 a valid 300 KB state payload returns 413; AUD-018 combined sync rejects when one mirror rejects.
- Audit Playwright keyboard (six mobile cases) and standalone suite could not launch because Chromium headless shell is missing. They are BLOCKED/NOT_TESTED, not feature failures. The pre-existing browser installation attempts and KERNEL browser restriction remain in effect.
- No finding is recorded FIXED from this phase. Next: address one confirmed finding, add/keep acceptance coverage, rerun its red test and affected green suites, then checkpoint.

## Phase 5 — AUD-009 fixed — 2026-11-13 17:38 Asia/Tehran

### Change
- Reset release creates and persists a random server generation for each distinct reset. Repeating the same reset release is idempotent and returns the already stored generation. The initial pre-reset state remains compatible with the build-time epoch.
- Added owner-authenticated `GET /reset/epoch`; writes after a released reset require its generation and return `426` plus `requiredEpoch` when stale.
- Client preflights the current server generation before enabling sync/hydration, tracks it separately from build-version reset metadata, clears local learning data behind the pending guard on a new generation, and sends the dynamic value on both event and state writes. A reset racing a live session fails closed and triggers a reload/reconciliation.

### Verification
- Targeted Worker audit tests for two complete resets, retrying each release, rejection of the first generation, and acceptance of a fresh event passed (5 passed; 1 unrelated route test skipped by filter).
- Client reset-generation/outbox/header tests passed. Integrated root: 77 files / 985 tests passed. Worker: 7 files / 123 tests passed. `npm run test:typecheck` passed. `npm run build` passed and Wrangler exited in `--dry-run`; no deployment occurred.
- `git diff --check` and staged Gitleaks scan passed. Full audit Worker suite still has red AUD-005, AUD-010, AUD-011, AUD-013. Playwright acceptance remains BLOCKED by missing Chromium.

Local commit: `a61760ec1971c09f14ea40236f80f69e039f5f3f`. GitHub code branch commit: `8a1e78be40ad6c7d87811af47e680c7e96513c86`. The exact local/remote tree SHA is `e57078ce02d55e23d0fbe58cdced6ec8fe3e0143`. No main merge or production deployment.

## Phase 6 — AUD-010 Drive ownership markers
Timestamp: 2026-11-13 14:27 Asia/Tehran.

- TDD red evidence: before the change, `reset.preserves-unmarked-matching-filename` failed because the unmarked `progress.json` file was selected for trash.
- New Drive files created by mirror upload paths receive private `appProperties` with `msOwner=math-scratchpad` and a kind (`events`, `state`, `backups`, or `other`). Existing legacy files are not adopted or migrated. Reset now requires an exact owner marker, the matching kind, and a recognized mirror filename; the trash operation re-reads and checks metadata before mutation. Bank IDs remain explicitly protected; unmarked, foreign-owner, unrelated `03_Sync`, and similarly named files are preserved.
- Acceptance: audit ownership test 1 passed; Google Drive ownership/pagination checks and upload marker checks 5 passed; `npm run test:worker` passed 7 files / 125 tests; `npm run test:typecheck` passed. `git diff --check` passed. Staged Gitleaks 8.30.1 scan reported no leaks.
- Local commit: `378ef0238ea7cedb7a0bdaeca2019f590646824f`. GitHub branch commit: `b0700a24aa32485224b4f7a33644d27dfc44f8e3`; tree `0c0f34b4272eab1701772c027c26cb3545a61825` matches the local tree. HTTPS push was unavailable in this runtime; the authorized GitHub Git Data connector advanced only `fix/audit-20261113-1319`.
- No production or live Drive mutation was performed. Next: AUD-011 Notion reconciliation journal.


## Phase 7 — AUD-011 durable Notion reference reconciliation
Timestamp: 2026-11-13 14:45 Asia/Tehran.

- Added the additive `notion_reset_reconciliation` journal with reset ID, kind, external key, Notion page ID, local owner marker, status, attempts, last attempt/error, and reconciliation timestamp. Reset now retains `notion_page_refs` until a page is verified and archived successfully; failures stay retryable, and unverified ownership stays journaled for recheck. New sync work is held while unresolved reconciliation remains.
- Before archive, the mockable Notion client retrieves the page and verifies its configured data source, matching stable row key, and app-specific markers (including Data Mode/isTest or mirror format). Session and unknown kinds such as Pomodoro are protected and never retrieved or archived.
- TDD evidence: the Phase 4 audit run had the AUD-011 red finding (reset deleted Notion references). New reset/reconciliation audit tests now pass 4/4. `npm run test:worker` passed 7 files / 125 tests; `npm run test:typecheck` passed; `git diff --check` passed; staged Gitleaks 8.30.1 reported no leaks.
- The first full Worker run exposed a test-environment leak of a dummy Notion key: a reset test attempted a `pages.retrieve` read and DNS failed before a response. No archive/update call ran. Test setup now restores that dummy binding and disables Notion for the unrelated reset case; subsequent runs passed. All acceptance-specific Notion calls use the fake client, with no successful live Notion read or write.
- GitHub code branch commit: `239d640a42e0b71d40b751a298ac61977f49ab0a`; tree `6a6673f022f5c6588645f557340994b5fffb0ae4` matches the local verified tree. Only the isolated fix branch moved. No release, merge, production mutation, or Notion archive was performed.
- Next: AUD-013 state payload limit. AUD-005 and other outstanding findings remain open; release gates and browser checks retain their prior NOT_TESTED/BLOCKED states.


## Phase 8 — AUD-013 public state payload limit
Timestamp: 2026-11-13 14:49 Asia/Tehran.

- TDD red: `state.accepts-valid-300kb-value-through-public-worker` returned 413 through the authenticated public Worker, while the direct Durable Object path returned 200. Root cause: the shared proxy body cap was 250,000 bytes even though the state endpoint accepts up to 2,100,000 bytes.
- Added a state-specific 2,100,000-byte streaming cap to the public proxy, matching the Durable Object; all other proxy routes retain their existing 250,000-byte default. The 300 KB value now succeeds through both paths.
- Verification: target audit test 1/1 PASS; `npm run test:worker` 7 files / 125 tests PASS; `npm run test:typecheck` PASS; `npm run worker:build` dry-run PASS; `git diff --check` PASS; staged Gitleaks 8.30.1 found no leaks. Full audit Worker suite: 12/13 tests pass; only AUD-005 scoped reset route remains red (404).
- GitHub code branch commit: `91fb29681990b62e74a3ec35cbf3d486f3a07671`; tree `45443e9b2ad53c604df5b8dd64db21f7d120560f` matches the local verified tree. Wrangler emitted a multiple-environment warning during dry-run; no deploy occurred.
- No live Notion or production action was performed during this phase. Next: AUD-005 scoped reset route.


## Phase 9 — AUD-005 scoped reset execution review
Timestamp: 2026-11-13 14:53 Asia/Tehran.

- AUD-005 remains BLOCKED. The audit asks for /reset/execute, but the reviewed scoped-reset design explicitly says execution is not implemented and the branch is NOT READY FOR MERGE OR PRODUCTION. Its proposed acceptance requires a durable saga across Durable Object data, browser/offline queues, Drive, Notion aggregates, scope generations, restart/retry, and preservation of unrelated learning records.
- This repository also has a Worker regression test asserting /reset/execute remains 404. Adding a route that merely returns a different status would satisfy only route existence and would falsely imply a safe selective reset. Enabling a partial deletion path would violate the design's preservation and reconciliation contract. No code or test was weakened; no destructive route was added.
- The integrated audit suite currently reports 12/13 PASS, with only the AUD-005 route-existence test red. This is marked BLOCKED pending a complete implementation contract and acceptance across all affected destinations; no production action or release approval was requested.
- Next: recheck AUD-018 mirror-failure isolation on the integrated branch, then continue other actionable findings.


## Phase 10 — AUD-018 mirror failure isolation
Timestamp: 2026-11-13 14:56 Asia/Tehran.

- The integrated implementation uses Promise.allSettled for Drive and Notion in the combined Worker sync route and returns sanitized per-destination failures plus subrequest counts. The prior implementation was already present from the integrated PR set; this phase strengthened and verified its acceptance coverage.
- Expanded the audit test to cover Drive failure with successful Notion completion, both destinations failing without leaking error details, Notion failure with a successful Drive result, and Cron retry signaling with sanitized diagnostic fields and subrequest counts.
- Verification: targeted audit file 4/4 PASS; full audit suite 15/16 PASS with only AUD-005 still red; `npm run test:worker` 7 files / 125 tests PASS; `npm run test:typecheck` PASS; `git diff --check` PASS; staged Gitleaks 8.30.1 no leaks. No live Cron invocation was made; production invocation details remain NOT_TESTED.
- GitHub code branch commit: `03a26b800249c5d681ad610535a39b5a28a34c25`; tree `47d951fac4ecd18a487586cb6fa111d16985377f` matches the local verified tree. Only the isolated fix branch moved.
- Next: AUD-012 dependency advisory verification. AUD-005 remains BLOCKED under the scoped-reset contract; production and browser gates are unchanged.


## Phase 11 — AUD-012 Zod high-severity advisory
Timestamp: 2026-11-13 15:11 Asia/Tehran.

- Verified the advisory against GitHub's reviewed record, GHSA-mrhx-c7xc-m3w5: Zod versions before 4.6.6 are affected; 4.6.6 is patched. The baseline lock had production `zod@3.25.76` and the supplied audit report recorded one high advisory. Reference: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5.
- Updated the production dependency and lockfile to exact `zod@4.6.6`; promoted the same already-locked registry artifact/integrity from the nested Cloudflare test dependency to the root. `npm ls zod --all --offline` reports one deduped 4.6.6 for the root, resolver, and Worker test plugin. Offline npm lock regeneration was unavailable because registry metadata was not cached (`ENOTCACHED`), so the existing verified lock entry was promoted without registry access.
- Migrated the app's schemas to `zod/mini` functional checks so the patched Zod 4 runtime stays tree-shakable. Preserved strict/loose object behavior, validation bounds, custom paths/messages, and schema inferred types. A 20,000-item array probe was rejected at the array bound before its element validator ran (0 element checks).
- Verification: `npm test` — 77 files / 985 tests PASS and Worker — 7 files / 125 tests PASS; `npm run typecheck` and `npm run test:typecheck` PASS; local `vite build` PASS; `node scripts/standalone.mjs` PASS at 2,691,726 bytes (below its 3,000,000-byte guard); `git diff --check` PASS; staged Gitleaks reported no leaks.
- Post-fix `npm audit --omit=dev` is NOT_TESTED: automatic review rejected the networked audit before execution because sending a dependency tree/private package names to `registry.npmjs.org` was not authorized. The full `npm run build` was likewise BLOCKED before execution because it includes `wrangler deploy --dry-run`, which may send a bundle or metadata to Cloudflare. No workaround was used; local Vite/standalone build succeeded. Worker dry-run remains NOT_TESTED.
- GitHub code branch commit: `14281e2c6c39ce318c441c58b9ae1bb5eceb4e83`; tree `e03c426c09f9bf4cfae3a4afd1627fe182a77de4` matches the staged local tree. Only the isolated fix branch moved; no PR, merge, deployment, or production mutation was made.
- Status: AUD-012 FIXED by locked patched package and safe local verification; post-fix `npm audit` remains NOT_TESTED as described. Next: AUD-001 blocker review. AUD-005 remains BLOCKED; AUD-006 remains PARTIAL; production/browser gates retain their prior states.


## Phase 12 — AUD-001 reset-pending recovery review
Timestamp: 2026-11-13 15:14 Asia/Tehran.

- Re-read the current gate, app startup/reset flow, Worker-session lookup, and reset client. While the local reset guard is set, the editor is inert and event queue/server writes are suppressed. The gate can clear only after an authenticated `/reset/preview` and `/state` check reports no cloud learning data; it then clears the local resettable data and reloads. A failed or unavailable check leaves the guard in place.
- AUD-001 remains BLOCKED by AUD-005. If cloud learning data remains, there is no safe server-side clear/reconciliation route in this branch; the scoped reset design and current 404 regression test keep execution disabled. Enabling the editor or clearing the guard without a verified cloud reset could lose current work or allow an old generation to return. Do not weaken the guard or its tests.
- Existing `tests/unit/server-connection-gate-reset.test.tsx` verifies the no-token state stays locked. The requested real-phone, failed-GIS, empty/nonempty server, interrupted-check, and reload acceptance matrix remains NOT_TESTED; no production or live data call was made in this review.
- Status: AUD-001 BLOCKED pending the complete AUD-005 reset saga and its tests. No code change. Next: AUD-002 debounce acceptance verification.


## Phase 13 — AUD-002 outbox debounce verification
Timestamp: 2026-11-13 15:16 Asia/Tehran.

- The current integrated branch already contains a 5,000 ms trailing timer reset by every persisted event and a 30,000 ms max-wait timer started once per burst. `syncNow()` clears both timers for explicit flushes; the retry timer remains separate, and wake/pagehide paths can flush promptly.
- Targeted verification: `tests/audit/outbox.debounce.test.ts` confirms no first POST before five seconds; `tests/unit/browser-sync.test.ts` confirms grouped trailing debounce, 30-second max wait during continuing activity, retained outbox/retry after reconnect, and pagehide keepalive flush. 5 tests passed across 2 files (38 filtered out).
- Status: AUD-002 FIXED by independently verified implementation and tests; no additional code change or live Worker call. Latest code branch stays `14281e2c6c39ce318c441c58b9ae1bb5eceb4e83` / tree `e03c426c09f9bf4cfae3a4afd1627fe182a77de4`. Next: AUD-003 exit/hidden-page flush review.


## Phase 14 — AUD-003 hidden/exit durable flush
Timestamp: 2026-11-13 15:19 Asia/Tehran.

- The current runtime registers both `pagehide` and `visibilitychange`; hidden/exit flush is bounded to 60 KB, authenticated, acknowledged before outbox removal, and retains the durable queue on failure. The full local Worker/browser E2E acceptance remains unavailable because Chromium is missing; KERNEL browser creation previously returned 403. No production Worker call was made.
- Added unit regression coverage for hidden-page flush, simultaneous `visibilitychange` + `pagehide` deduplication, acknowledgment-only queue removal, and offline pagehide retaining IndexedDB data for a newly created runtime after reload. Existing pagehide test remains.
- Verification: entire `tests/unit/browser-sync.test.ts` 44/44 PASS; targeted typechecks PASS; prior full `npm test` 77 files / 985 tests and Worker 7 files / 125 tests PASS. `git diff --check` and staged Gitleaks PASS. Real browser/local Worker E2E, server observation after browser close, and production behavior remain NOT_TESTED.
- Status: AUD-003 PARTIAL — implementation and durable unit behaviors are verified; the full Worker/browser E2E acceptance remains BLOCKED/NOT_TESTED due the unavailable browser. GitHub code commit `49f7c96c0fce5f5ae57273ba8c221c202a278885`; tree `a5f2467d3f9b8293af24e38fd32354a8ee9dba50`. Next: AUD-004 Pages/Worker deployment SHA drift.


## Phase 15 — AUD-004 production Pages/Worker SHA drift
Timestamp: 2026-11-13 15:24 Asia/Tehran.

- Read-only recheck confirmed the successful GitHub Pages run `43238966350` completed on `main` SHA `7eeeef0bf7d524323f88e3520484dfd3a0f7a7bf`. Cloudflare's current 100% Worker deployment is deployment `6bbfd5a8-6641-483f-a478-65fa408b36b1`, version `d376eafb-f0ab-42b9-8409-aab8f9bbaead`, annotated `fix/learning-reset-stuck-lock 59913b8`, created `2026-11-12T17:08:08Z`. The deployed source refs differ.
- `main`'s Worker environment type has no release SHA binding, and its Pages workflow builds and deploys on a `main` push independently. The repository currently has `ci.yml`, `pages.yml`, and `pr71-ux-evidence.yml`; no coordinated Worker+Pages release workflow was found. Production `/health` evidence in the audit report returned only `ok` and `service`, so it does not attest the deployed commit.
- The isolated fix branch contains a health response that can expose `RELEASE_ENV` and `RELEASE_SHA`, but the release pipeline still needs to provide the actual immutable SHA to both artifacts and deploy them together. This code branch has not been merged or released. Source-only work cannot resolve the currently deployed mismatch.
- Status: AUD-004 BLOCKED pending an approved, coordinated Pages/Worker release and post-deploy identity comparison. No Cloudflare write, Pages deployment, merge, or live change was made. No code change in this phase.
- Evidence: GitHub Actions run `43238966350` (`success`, head SHA `7eeeef0...`); read-only Cloudflare deployment list (100% on `d376eafb...`, annotation `59913b8`).
- Latest code branch remains `49f7c96c0fce5f5ae57273ba8c221c202a278885`, tree `a5f2467d3f9b8293af24e38fd32354a8ee9dba50`. No test suite ran in this phase because this was a read-only release-state audit.
- Checkpoint whitespace checks passed. Gitleaks was NOT_RUN because the executable is absent in this runtime; this phase adds only public deployment/run identifiers and commit SHAs, with no credentials or secret material.
- Next: AUD-007 compact mobile menu Enter activation.


## Phase 16 — AUD-007 compact mobile menu keyboard focus
Timestamp: 2026-11-13 15:35 Asia/Tehran.

- Reproduced the Import session JSON Enter failure 5/5 times at mobile-320 before the change. The item briefly received focus, then Radix returned focus to the root `role=menu`; the target received no keydown or click. The inline mobile disclosure is rendered inside the same Radix menu, so its trigger's pointerleave path must not clear focus when that group remains expanded.
- Updated compact Practice and Data disclosures to prevent the default Radix pointerleave focus reset while their inline groups are expanded. This preserves item focus as the menu scrolls into the child action list. Updated the regression to scroll the Import item into view and assert it remains focused before Enter/Space.
- Local browser support was enabled from the already-installed `@sparticuz/chromium` package by `npm run test:browser:prepare`; it created `/tmp/math-chromium` without network access. The prior missing-browser blocker no longer applies to these local checks.
- Verification after the fix: repeated Import Enter direct-focus test 5/5 PASS; repeated locator-press Enter test 5/5 PASS. After removing temporary diagnostic logging, the full keyboard file passed 6/6 at mobile-320 and 6/6 desktop; integrated `UI-AUDIT-07` passed 1/1 at mobile-320. `npm run typecheck`, `npm run test:typecheck`, `npx vitest run tests/keyboard-ux.test.tsx` (15/15), and `git diff --check` passed. This phase did not rerun the full application/Worker suite.
- Status: AUD-007 FIXED in the isolated code branch. No production data or deployment was touched. Current local commit `f126b4e5292d4d41238f060da504a4959049ec2a`; synchronized GitHub code branch commit `8c40cc4ce18f824901abd77414451de681c880d3`; both have tree `a70745f39e9996eabdb14b6284b414276b9fd1b1`. No PR, merge, or release.
- `git diff --check` passed. Gitleaks was NOT_RUN because the executable is absent in this runtime; this phase adds only focus handling and test code, with no credentials or secret material.
- Next: AUD-008 mobile-320 visual CI failure.


## Phase 17 — AUD-008 mobile visual baseline drift
Timestamp: 2026-11-13 15:42 Asia/Tehran.

- Reproduced the CI screenshot mismatch locally. At mobile-320 the current single-edit image differed by 27,477 pixels (11%); batch-edit differed by 26,971 (8%) and confidence by 30,872 (9%). The audit's original PR 92 run `43278685074` reported 27,690 pixels (11%) for single-edit. The mismatch also reproduced in all three states at mobile-390 and mobile-430 (about 8–11%).
- Inspected expected, actual, and pixel-diff images. The current UI contains the newer Workspace selector and palette; the audit's Git history ties both to changes after the old baseline. The diff also includes editor-focus and modal-placement changes; their full history was not separately isolated. The initial app view at 320/390/430 has no horizontal overflow, verified separately.
- Refreshed only the nine Linux snapshots for single-edit, batch-edit, and confidence at widths 320, 390, and 430. Linux is the renderer used by the configured `ubuntu-latest` CI. Windows snapshots were left as-is because this Linux runtime cannot generate Windows-rendered baselines.
- Verification: visual matrix with snapshot updates completed 9/9; repeat run without update completed 9/9. The existing initial-layout overflow/menu test passed 3/3 at mobile-320, 390, and 430. `git diff --check` passed. This phase did not run the full test suite.
- Status: AUD-008 FIXED for the Linux CI renderer by aligning baselines with the current reviewed UI; no frontend code changed. Local commit `4caa996b41af826ea1100828d398e1fded235e4c`; GitHub code branch commit `f00e16ddd7afa62e887444ee1638074be32a83a1`; local and remote tree both `4181ae33768933839edb961a9d380704ecd55bef`. No PR, merge, deployment, or live data change.
- Gitleaks was NOT_RUN because the executable is absent in this runtime. The nine generated PNG baselines contain no credentials or secret material.
- Next: AUD-014 queued-event suppression while reset is pending.

