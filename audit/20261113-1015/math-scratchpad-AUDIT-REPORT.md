# Math Scratchpad — Full Audit Report
RUN_ID 20261113-1015 · 2026-11-13 Asia/Tehran · status: PARTIAL · auditor: Codex

## 0. TL;DR
5 Blocker, 1 Critical, 10 High, 1 Medium, 1 Low. Findings include static risks, not all reproduced.
Can learning safely start today? **Conditional: do not start on the phone while the reset-pending banner remains; desktop and cross-device safety are unverified.** A reset-pending browser can be locked, exit-flush is absent in main, and distinct reset releases reuse the same epoch; an old-generation event was accepted after two complete local Worker resets (Drive disabled). No safe phone-only recovery was verified.
Shortest path to readiness: align Pages and Worker on one reviewed SHA; fix the reset/epoch/outbox blockers and import replacement guard; pass isolated phone/desktop and release gates.

## 1. Environment & coverage
Repository cloned. Node 24.22.1, npm 11.9.0. npm ci --ignore-scripts succeeded; local tests ran. Cloudflare read access succeeded. Google Drive personal identity verified and audit backup created. Read-only Notion aggregate counts were queried for four project-designated sources; shared Sessions was deliberately not counted without a reliable project marker. Real sign-in and protected production data were not touched. Backups: [Drive audit folder](https://drive.google.com/drive/folders/1-7BbdX9a5_IZ76cWfRUI60R91tYIMdhl) and [GitHub audit branch](https://github.com/amirhoseinLotfii/math-scratchpad/tree/audit/full-20261113-1015).
PARTIAL: Phases 0 and 1 complete; Phase 2 blocker triage partially complete (owner-phone recovery, Chapter 1, and real sign-in remain NOT_TESTED/BLOCKED); Phase 3 route/schema/state review recorded; Phases 4–7 and 10 are focused, not exhaustive; Phase 8 tests and Phase 9 browser scenarios are partial; Phase 11 self-check completed successfully. Static review does not count as behavioral testing. No claim of exhaustive coverage.

## 2. Versions & release drift
- main: 7eeeef0bf7d524323f88e3520484dfd3a0f7a7bf
- PR 91: open, 59913b8fb45bfe07ca2f31614efb1843b2b5569d, based on main.
- PR 92: open draft, f384ca4fe9b4844df15a528ecb41529f138794ef, based on PR 91 head.
- PR 93: open draft, d1c730c643d1aef994a5f9fc9afe09876cca18fd, based on main.
- Pages: successful deploy run [43238966350](https://github.com/amirhoseinLotfii/math-scratchpad/actions/runs/43238966350), SHA main above.
- Worker: deployment annotation 59913b8, version d376eafb-f0ab-42b9-8409-aab8f9bbaead, 100%, 2026-11-12 17:08:08 UTC. /health returned only ok/service. Admin status returned 401 unauthenticated.

## 3. Test results
| Ref | Suite | Status | Result | Evidence |
|---|---|---|---|---|
| main | Typecheck | VERIFIED | exit 0 | npm run typecheck, this run |
| main | Vitest | VERIFIED | 75 files, 975 tests passed | npx vitest run, this run |
| main | Worker | VERIFIED | 6 files, 113 tests passed | npm run test:worker, this run |
| main | Targeted sync/auth | VERIFIED | 3 files, 44 tests passed | npx vitest run tests/unit/browser-sync.test.ts tests/unit/learning-reset-client.test.ts tests/unit/google-auth.test.ts |
| main | AXE mobile-320 | VERIFIED | 9 passed | npx playwright test e2e/accessibility/axe-states.spec.ts --project=mobile-320 --workers=1 |
| main | UI-AUDIT-07 mobile-320 | VERIFIED | 1 passed | same test passed on main, not PR 93; local run |
| main | Import JSON keyboard activation | FAILED | Pixel 7 emulation at 320 px: Enter focus test failed 4/5 repeats (target received no keydown/click after blur); desktop passed 5/5 | e2e/audit/menu.keyboard.spec.ts; AUD-007 |
| main | Build | VERIFIED | exit 0, Worker dry run | npm run build; standalone build warned import.meta is empty in IIFE; effect NOT_TESTED |
| PR 93 | CI gate | FAILED | 90 passed, 1 failed, 515 did not run | [run](https://github.com/amirhoseinLotfii/math-scratchpad/actions/runs/43294569144), AUD-007 |
| PR 92 | CI gate | FAILED | 93 passed, 1 failed, 512 did not run | [run](https://github.com/amirhoseinLotfii/math-scratchpad/actions/runs/43278685074), AUD-008 |
| PR 91 | Worker tests | VERIFIED | 6 files, 115 passed | local, exact head 59913b8 |
| PR 92 | Worker tests | VERIFIED | 7 files, 122 passed | local, exact head f384ca4 |
| main | Cron mirror rejection | FAILED | 3 synthetic runs: unexpected Drive rejection escaped combined request | worker/test/audit/cron.isolates-mirror-failures.test.ts; AUD-018 |
| PR 93 | Cron mirror isolation | VERIFIED | existing equivalent Worker test passed as part of 114 Worker tests | worker/tests/sync-worker.test.ts:108 |
| main | Auth downstream storage exception | VERIFIED | synthetic storage failure returned 5xx rather than 401 | worker/test/audit/auth.downstream-error.test.ts; narrow test |
| main | Initial synthetic layout | VERIFIED | 3 passed on 320, Pixel 7 and 1440 desktop: no horizontal overflow or pageerror before menu | e2e/audit/layout.initial.spec.ts, external requests blocked |
| main | Duplicate delivery | VERIFIED | one Worker test passed: same event retry stored once, conflicting content rejected; 112 tests filtered out | worker/tests/sync-worker.test.ts |
| main | Session JSON replace confirmation | FAILED | 3 local mobile runs replaced synthetic work without confirmation | e2e/audit/import.requires-confirmation.spec.ts; AUD-017 |
| main | Backup-file replace confirmation | FAILED | 3 local mobile runs replaced synthetic work before any confirmation dialog | e2e/audit/import.file-confirmation.spec.ts; AUD-017 |
| main | Invalid session JSON | VERIFIED | 3 mobile tests: invalid, oversized and script-bearing malformed input displayed error; no test script executed | e2e/audit/import.invalid-inputs.spec.ts; no general XSS guarantee |
| main | Standalone offline build | FAILED | editor never mounts; undefined PROD, 3 browser test failures | e2e/audit/standalone.start.spec.ts; AUD-016 |
| main | Full backup fixture | VERIFIED | mobile and desktop each passed; desktop initially crashed under concurrent load, rerun passed | e2e/persistence/learning-backup.spec.ts |
| main | Keyboard adaptations | VERIFIED | 15 passed mobile-320 | e2e/accessibility/keyboard-and-adaptations.spec.ts |
| main | Menu keyboard subset | FAILED | Initial 10 targeted Enter/Space/Escape cases passed once; repeat Enter activation of Import session JSON failed 4/5 on 320 px and passed 5/5 on desktop; Escape+focus restoration passed 2/2 | e2e/audit/menu.keyboard.spec.ts; AUD-007 |
| main | Desktop AXE | VERIFIED | 9 passed on laptop-1440 | e2e/accessibility/axe-states.spec.ts |
| main | Source/test typecheck | VERIFIED | exit 0 | npm run test:typecheck |
| PR 91 | CI gate | FAILED | invalid-json accessibility setup timed out on Enter, retried; 597 not run | [run](https://github.com/amirhoseinLotfii/math-scratchpad/actions/runs/43266173382), related AUD-007 |
| main | Icon consistency | FAILED | three mobile-320 local runs: missing SVG | e2e/audit/menu.import-icon.spec.ts; AUD-015 |
| main | Outbox while reset pending | FAILED | three runs transmitted queued synthetic event | tests/audit/outbox.reset-pending.test.ts; AUD-014 |
| main | Outbox 5-second debounce | FAILED | three runs sent after roughly 4 ms | tests/audit/outbox.debounce.test.ts; AUD-002 |
| main | UI audit mobile-320 | VERIFIED | 9 passed | e2e/ui-audit-regressions.spec.ts |
| main | Local storage / conflict desktop | VERIFIED | 8 passed | local-storage-sync and server-conflict-resolution |
| PR 93 | Full Vitest | VERIFIED | 75 files, 980 passed | npx vitest run at pinned head |
| PR 93 | Mocked Google sign-in/Drive browser | VERIFIED | 3 mobile-390 tests passed | drive-session-confirmation and google-auth-new-tab; local symlinked dependencies emitted Vite font warnings |
| PR 93 | Worker and typecheck | VERIFIED | 114 worker tests and typecheck passed | local pinned head |
| main | Public versus DO state size | FAILED | 3 local runs: direct 300 KB state succeeds, public route returns 413 | worker/test/audit/state.proxy-limit.test.ts; AUD-013 |
| main | Ownership and Notion audit | FAILED | 2 synthetic assertions failed in three runs | worker/test/audit/reset.ownership-and-notion.test.ts; AUD-010 and AUD-011 |
| main | Connected lesson and AXE | VERIFIED | 3 passed mobile-390 | e2e/lessons/phase3-connected.spec.ts and phase5-a11y.spec.ts, synthetic fixtures |
| main | npm audit production deps | FAILED | one high advisory, exploitability untested | npm audit --omit=dev; AUD-012 |
| main | Synthetic epoch release regression | FAILED | failed three independent runs, same epoch twice | worker/test/audit/reset.epoch.second-release.test.ts; AUD-009 |
| main | Two local resets and old event | FAILED | three runs: old event received HTTP 200 and/or was stored instead of rejection | worker/test/audit/reset.stale-event.two-full-resets.test.ts; Drive disabled; AUD-009 |
| main | Synthetic lesson persistence | VERIFIED | 1 mobile test passed including answers and reload | e2e/lessons/phase4-persistence.spec.ts, sample fixture |
| main | Offline outbox, mocked network | VERIFIED | mobile 390: 1 passed; desktop: 2 passed | e2e/persistence/offline-outbox.spec.ts; no real Worker or Google service |
| main | Synthetic lesson resume | VERIFIED | 2 mobile tests passed | e2e/lessons/resume-learning.spec.ts; fixture only, no Chapter 1 |
| main | Inline keyboard placement | VERIFIED | 1 mobile test passed in isolated rerun | e2e/lessons/keyboard-placement-regression.spec.ts; an earlier concurrent run failed during trace cleanup after both processes used same output dir; not attributed to application |
| PR 93 | Targeted unit | VERIFIED | 4 files, 56 tests passed | browser-sync, google-auth, google-id-token, server-connection-gate-reset tests |
| PR 93 | UI-AUDIT-07 mobile-320 | FAILED | same missing backup region as CI | local exact head, symlinked node_modules; Vite font allow-list warning is a local environment limitation |
| All refs | Full browser / complete audit tests | NOT_TESTED | incomplete | Most scenarios remain |

## 4. Blockers
| Order | ID | Title | Refs | Size | Phone workaround |
|---:|---|---|---|---|---|
| 1 | AUD-001 | Reset-pending state makes editor inert until authenticated cloud check | main, PR 93 | M | No verified workaround; preserve browser data and do not clear/reset/sync manually. |
| 2 | AUD-009 | Distinct reset releases reuse a static epoch; old-generation event accepted | main, PR 91, PR 93 | L | Avoid further reset or sync until fixed and verified. |
| 3 | AUD-014 | Runtime can send queued events while reset is pending | main, PR 93 | M | Do not manually authenticate/sync from the pending-reset state. |
| 4 | AUD-003 | Exit/hidden-page flush is absent from main | main | M | Keep the app open while unsynced; no safe close-tab recovery was verified. |
| 5 | AUD-017 | Session imports replace current work without confirmation | main | M | Do not import a session or backup into work that must be preserved; save a separate copy first. |

## 5. All findings
### AUD-001 — Reset-pending state makes editor inert until authenticated cloud check
- **Category:** Bug
- **Severity:** Blocker · **Blocks learning today:** yes
- **Confidence:** likely · **Verification:** NOT_TESTED
- **Refs affected:** main 7eeeef0; PR 93 d1c730c
- **Location:** src/sync/server-connection-gate.tsx:135; src/main.tsx:42
- **Related:** C1 C6 H8 K1 N2
- **Evidence:** Static inspection: pending flag makes the entire editor inert; main clears the flag only after an authenticated hasCloudLearningData check. PR 93 retains the inert guard. Real phone state and Google timeout were not observed in this run.
- **Reproduction:** Inspect the referenced source and run the acceptance test below. Red test: n/a (not created in this partial run).
- **Expected / Actual:** Contract and acceptance behavior below / evidence above.
- **Root cause:** layer state; src/sync/server-connection-gate.tsx:135; src/main.tsx:42; mechanism or unresolved cause as stated in evidence.
- **Proposed fix (not executed):** Provide a safe, explicitly verified recovery after server reconciliation without requiring a working interactive Google popup; preserve epoch protection.
- **Fix acceptance:** Test pending flag with failed Google sign-in, server empty and nonempty, interrupted check and subsequent reload; verify no old data reappears.
- **Size:** M · **Fix risk:** high

### AUD-002 — Outbox initiates sync immediately instead of five-second trailing debounce
- **Category:** Contract violation
- **Severity:** High · **Blocks learning today:** no
- **Confidence:** confirmed · **Verification:** VERIFIED
- **Refs affected:** main 7eeeef0
- **Location:** src/sync/runtime.ts:285
- **Related:** N1 B2 B3 B4 K8
- **Evidence:** Three local mocked unit runs observed the first event POST approximately 4 ms after emission rather than after 5 seconds. After queue persistence refreshCountAndTrigger calls syncNow immediately when authenticated. PR 93 adds debounce and maximum-wait timers at runtime.ts:322–345, but behavior has not been independently verified.
- **Reproduction:** Run `npx vitest run tests/audit/outbox.debounce.test.ts`. This uses a synthetic event, mocked network and wall-clock timing; fake-timer max-wait coverage remains outstanding.
- **Expected / Actual:** Contract and acceptance behavior below / evidence above.
- **Root cause:** layer outbox; src/sync/runtime.ts:285; mechanism or unresolved cause as stated in evidence.
- **Proposed fix (not executed):** Introduce tested 5-second trailing debounce and 30-second maximum wait, respecting explicit flushes and retries.
- **Fix acceptance:** Fake-clock tests for five events, continuous events, authentication changes and concurrent running sync.
- **Size:** M · **Fix risk:** medium

### AUD-003 — Exit and hidden-page flush are absent from main
- **Category:** Contract violation
- **Severity:** Blocker · **Blocks learning today:** yes
- **Confidence:** likely · **Verification:** NOT_TESTED
- **Refs affected:** main 7eeeef0
- **Location:** src/sync/runtime.ts:102; src/sync/runtime.ts:292
- **Related:** N1 B5 B6 K8
- **Evidence:** start does not register pagehide; onPageHide is empty; visibilitychange only acts when visible. Queued events may remain local rather than reach server before exit; actual data loss or duplication has not been demonstrated.
- **Reproduction:** Inspect the referenced source and run the acceptance test below. Red test: n/a (not created in this partial run).
- **Expected / Actual:** Contract and acceptance behavior below / evidence above.
- **Root cause:** layer outbox; src/sync/runtime.ts:102; src/sync/runtime.ts:292; mechanism or unresolved cause as stated in evidence.
- **Proposed fix (not executed):** Implement bounded authenticated keepalive flush with acknowledgement and durable retry, without removing events prematurely.
- **Fix acceptance:** Local Worker E2E: answer then hide/close within 2 seconds, verify server and reload, including offline and concurrent flush.
- **Size:** M · **Fix risk:** high

### AUD-004 — Production Worker and Pages originate from different commits
- **Category:** Release
- **Severity:** High · **Blocks learning today:** no
- **Confidence:** confirmed · **Verification:** VERIFIED
- **Refs affected:** production; main 7eeeef0; PR 91 59913b8
- **Location:** Worker deployment d376eafb-f0ab-42b9-8409-aab8f9bbaead; .github/workflows/pages.yml
- **Related:** N7 L5 L7 K7
- **Evidence:** Cloudflare deployment annotation identifies 59913b8, 100% version d376eafb, 2026-11-12 17:08 UTC. Successful Pages run 43238966350 used main 7eeeef0. GET /health returned only ok and service, no SHA or environment. Deployment annotation is evidence, not a cryptographic artifact identity.
- **Reproduction:** Inspect the referenced source and run the acceptance test below. Red test: n/a (not created in this partial run).
- **Expected / Actual:** Contract and acceptance behavior below / evidence above.
- **Root cause:** layer config; Worker deployment d376eafb-f0ab-42b9-8409-aab8f9bbaead; .github/workflows/pages.yml; mechanism or unresolved cause as stated in evidence.
- **Proposed fix (not executed):** Merge and release an agreed commit through a single versioned pipeline; inject immutable SHA and environment into health.
- **Fix acceptance:** Compare deployed Pages build and Worker health SHA with main after release, with rollback and staging checks.
- **Size:** M · **Fix risk:** high

### AUD-005 — Scoped reset execution is not implemented
- **Category:** Missing
- **Severity:** High · **Blocks learning today:** no
- **Confidence:** confirmed · **Verification:** VERIFIED
- **Refs affected:** main 7eeeef0; PR 92 f384ca4
- **Location:** worker/src/index.ts:219; PR 92 worker/src/index.ts:231
- **Related:** N3 C9 K6
- **Evidence:** A local synthetic Worker request to POST /reset/execute returned 404 in three prior runs and again after environment restoration. Both inspected route lists expose GET /reset/preview but no /reset/execute. PR 92 scoped-reset-plan.ts:38–45 explicitly describes a future transactional planner. No production write or endpoint probing was performed.
- **Reproduction:** Run `npx vitest run --config worker/test/audit/vitest.audit.config.ts worker/test/audit/reset.scoped-execute-route.test.ts`. This establishes missing routing only; execution semantics still need full tests.
- **Expected / Actual:** Contract and acceptance behavior below / evidence above.
- **Root cause:** layer worker; worker/src/index.ts:219; PR 92 worker/src/index.ts:231; mechanism or unresolved cause as stated in evidence.
- **Proposed fix (not executed):** Design journaled scoped execution with isolation, idempotency and ownership checks across all layers.
- **Fix acceptance:** Synthetic local integration tests for preview, two confirmations, execute, restart, concurrency and preserved unrelated data.
- **Size:** L · **Fix risk:** high

### AUD-006 — PR 93 replaced Enter with pointer click in AXE setup
- **Category:** CI/test
- **Severity:** Medium · **Blocks learning today:** no
- **Confidence:** confirmed · **Verification:** VERIFIED
- **Refs affected:** PR 93 d1c730c
- **Location:** e2e/accessibility/axe-states.spec.ts:20
- **Related:** K5 I2 L2
- **Evidence:** Git history shows commit b305a95 replaced press Enter with click; 776fd7fc changed only the comment. Separate CI test UI-AUDIT-07 still uses Enter and fails. This change does not itself establish the underlying UI cause.
- **Reproduction:** Inspect the referenced source and run the acceptance test below. Red test: n/a (not created in this partial run).
- **Expected / Actual:** Contract and acceptance behavior below / evidence above.
- **Root cause:** layer test; e2e/accessibility/axe-states.spec.ts:20; mechanism or unresolved cause as stated in evidence.
- **Proposed fix (not executed):** Restore explicit keyboard coverage and independently investigate focus and submenu behavior; retain pointer coverage.
- **Fix acceptance:** Real keyboard Enter and Space across device projects; assert dialog opens and focus returns.
- **Size:** S · **Fix risk:** low

### AUD-007 — Import session JSON loses Enter activation intermittently in the compact mobile menu
- **Category:** Accessibility/CI
- **Severity:** High · **Blocks learning today:** no
- **Confidence:** confirmed · **Verification:** VERIFIED
- **Refs affected:** main 7eeeef0; PR 91 59913b8; PR 93 d1c730c
- **Location:** src/app/exercise-menu.tsx:86, 123–130; e2e/ui-audit-regressions.spec.ts:103
- **Related:** N8 K5 I2 L3 L4 · Related AUD-006
- **Evidence:** PR 93 run 43294569144 UI-AUDIT-07 failed twice after Enter; PR 91 run 43266173382 timed out twice on the same workflow. On main, the added focused keyboard test failed 4/5 repeated runs at Pixel 7 emulation 320×640: the target received a focus then blur, remained unactivated (no keydown/click), and the menu itself regained focus; desktop passed 5/5. A separate locator.press('Enter') test failed 2/3 mobile repeats and passed 3/3 desktop repeats. An initial one-shot subset passed, so the defect is intermittent. Static code shows the compact path places Data actions inside an inline role=group, whereas desktop uses Radix submenu content; this is a likely focus-management trigger, not a proven root cause.
- **Reproduction:** npx playwright test --config e2e/audit/playwright.keyboard.config.ts -g 'menu.import-json.opens-with-Enter' --workers=1 --repeat-each=5; inspect per-run [AUDIT_MENU_KEYBOARD] diagnostics. Test file: e2e/audit/menu.keyboard.spec.ts.
- **Expected / Actual:** Enter on the focused Import session JSON item opens Session backup / on 4 of 5 narrow-mobile repeats, focus was redirected to the menu before key delivery and the backup panel did not open.
- **Root cause:** likely compact-menu focus management in the UI (src/app/exercise-menu.tsx:123–130); exact Radix/focus transition remains unisolated.
- **Proposed fix (not executed):** Make compact submenu items remain in the keyboard roving-focus sequence; retain explicit Enter and Space tests on Pixel 7, 320 px, and desktop.
- **Fix acceptance:** The audit spec passes 10/10 repeated attempts per device for both Enter and Space, Esc closes and returns focus, and UI-AUDIT-07 passes on the exact PR head.
- **Size:** M · **Fix risk:** medium

### AUD-008 — PR 92 mobile-320 visual CI gate fails
- **Category:** CI/test
- **Severity:** High · **Blocks learning today:** no
- **Confidence:** confirmed · **Verification:** VERIFIED
- **Refs affected:** PR 92 f384ca4
- **Location:** e2e/visual/mobile-layout.spec.ts:23
- **Related:** H1 L3
- **Evidence:** Run 43278685074 failed single-edit snapshot and its retry: 27,690 pixels differed (11%) against 3% tolerance; 93 passed, 512 did not run. CI expected and actual images were inspected: the actual adds a Workspace selector and changes palette. The baseline snapshot last changed at c05bcf4; git blame identifies selector introduction in 9a14772, a later ancestor of main; theme-token change 4ea691c is also a later ancestor. PR 92 changes no frontend/snapshot files relative to its PR 91 base. These observations support baseline drift; the complete cause of pixel differences remains unproven. [Expected](https://drive.google.com/file/d/1MGBmxuM8vOclZ1MvdYNZc_6OQG0dWQV2/view) · [Actual](https://drive.google.com/file/d/1SLmcjifTDSy4rRtLBjhlXM4iXcPCbVAG/view).
- **Reproduction:** Inspect the referenced source and run the acceptance test below. Red test: n/a (not created in this partial run).
- **Expected / Actual:** Contract and acceptance behavior below / evidence above.
- **Root cause:** layer CI; e2e/visual/mobile-layout.spec.ts:23; selector was introduced after the baseline; palette and remaining pixel causes require review.
- **Proposed fix (not executed):** Inspect CI baseline, actual and diff on exact head before deciding whether UI or baseline requires change.
- **Fix acceptance:** Repeat on CI-equivalent renderer; review screenshots on 320 px, then pass visual suite.
- **Size:** M · **Fix risk:** medium

### AUD-009 — Distinct reset releases reuse a static epoch
- **Category:** Data
- **Severity:** Blocker · **Blocks learning today:** yes
- **Confidence:** confirmed · **Verification:** VERIFIED
- **Refs affected:** main 7eeeef0; PR 91 59913b8 and PR 93 d1c730c by static inspection only
- **Location:** `src/sync/learning-reset-epoch.ts:1`; `worker/src/event-store.ts:244`; `worker/src/event-store.ts:419`; `src/sync/browser-db.ts:105`
- **Related:** N2 · C5 · C7 · B11 · Related AUD-001
- **Evidence:** Three local Worker test executions failed identically: two distinct reset IDs released from a synthetic `awaiting_release` state produced `2026-11-12-v3` both times. The release handler writes the compile-time constant; event writes compare against that value, and local preparation also compares to the same constant. A further local test executed two complete Worker reset and release handlers with Drive explicitly disabled. A synthetic event prepared before the second reset was accepted with HTTP 200 and stored afterward; three runs failed the rejection assertion. An invalid epoch control returned 426 in a separate isolated test. No real external service or owner data was touched.
- **Reproduction:** Run `npx vitest run --config worker/test/audit/vitest.audit.config.ts worker/test/audit/reset.stale-event.two-full-resets.test.ts` against main. It executes two Worker resets and releases on an isolated Durable Object, disables Drive, and submits a synthetic event from the first epoch after the second reset.
- **Expected / Actual:** Each distinct completed reset changes the generation / both releases write the same hardcoded value. A synthetic event carrying the earlier epoch was accepted and stored after the second local reset. An actual two-device browser journey and external mirrors remain NOT_TESTED.
- **Root cause:** worker / state · `worker/src/event-store.ts:419` · release writes a code constant rather than a new server-issued generation per distinct reset, and the client relies on that same constant.
- **Proposed fix (not executed):** Persist a monotonic or unique server-issued epoch per reset; deliver it safely to clients, associate queued events with their creation epoch, reject stale writes and require verified reconciliation, while preserving idempotent release retries and migration compatibility.
- **Fix acceptance:** Red test becomes green; local end-to-end tests execute two complete resets, retry each release, submit events from both old generations, and check that fresh writes succeed and unrelated data survives.
- **Size:** L · **Fix risk:** high

### AUD-010 — Reset selects Drive files by name without an ownership marker
- **Category:** Data
- **Severity:** Critical · **Blocks learning today:** no
- **Confidence:** confirmed · **Verification:** VERIFIED
- **Refs affected:** main 7eeeef0 (executed); PR 91 59913b8 and PR 92 f384ca4 (static inspection)
- **Location:** `worker/src/event-store.ts:125`; `worker/src/event-store.ts:485`
- **Related:** N4 · F1 · F2 · F3 · K4
- **Evidence:** Three isolated local test runs supplied a fake Drive child called progress.json with no project ownership marker inside a validated synthetic sync folder; the reset invoked the fake trash operation on it. Nothing was trashed on real Drive. Selection matches a filename pattern and protected bank ID, not an ownership marker.
- **Reproduction:** Run `npx vitest run --config worker/test/audit/vitest.audit.config.ts worker/test/audit/reset.ownership-and-notion.test.ts`; test `reset.preserves-unmarked-matching-filename` fails.
- **Expected / Actual:** Only positively identified owned files may be selected / an unmarked matching filename was selected for trash. Real affected file count is unknown.
- **Root cause:** drive · `worker/src/event-store.ts:485` · filename and parent path are treated as sufficient proof of ownership.
- **Proposed fix (not executed):** Add durable ownership metadata to new mirrors and use a separately reviewed migration/reconciliation process for legacy files; default unmarked files to preserve.
- **Fix acceptance:** Fake Drive tests verify unmarked, unrelated, bank, Pomodoro and similarly named files are untouched; only marked files are selected, including pagination and retry scenarios.
- **Size:** L · **Fix risk:** high

### AUD-011 — Reset clears Notion page references without external reconciliation
- **Category:** Data
- **Severity:** High · **Blocks learning today:** no
- **Confidence:** confirmed · **Verification:** VERIFIED
- **Refs affected:** main 7eeeef0 (executed); PR 91 59913b8 and PR 92 f384ca4 (static inspection)
- **Location:** `worker/src/event-store.ts:371`; `worker/src/event-store.ts:532`
- **Related:** N4 · F1 · C8 · K4
- **Evidence:** Three local Worker test runs inserted a synthetic Notion reference, ran reset with Drive disabled, and observed the local reference count become zero. The inspected reset handler makes no external Notion archive call before clearing references; live Notion rows were not inspected and no external service was modified.
- **Reproduction:** Run `npx vitest run --config worker/test/audit/vitest.audit.config.ts worker/test/audit/reset.ownership-and-notion.test.ts`; `reset.retains-notion-reference-until-external-reconciliation` fails.
- **Expected / Actual:** Retain a recoverable reconciliation journal until owned external rows are verified / references are erased and reset reports completion without that step.
- **Root cause:** notion · `worker/src/event-store.ts:532` · local projection and page references are deleted before any verified external cleanup.
- **Proposed fix (not executed):** Keep a durable journal, verify project ownership, and reconcile owned external rows with resumable idempotent handling before final release; never target Pomodoro.
- **Fix acceptance:** Mocked Notion integration demonstrates failures retain retry state and page IDs; success archives only verified project-owned rows and preserves unrelated rows.
- **Size:** L · **Fix risk:** high

### AUD-012 — Production dependency audit reports high-severity Zod advisory
- **Category:** Security
- **Severity:** High · **Blocks learning today:** no
- **Confidence:** confirmed · **Verification:** VERIFIED
- **Refs affected:** main 7eeeef0
- **Location:** `package.json`; `src/sync/learning-backup.ts:39`
- **Related:** J7 · J3
- **Evidence:** `npm audit --omit=dev --json` reported one high advisory, GHSA-mrhx-c7xc-m3w5, for direct dependency zod 3.25.76. The advisory describes memory exhaustion while validating oversized constrained collections; code contains large array schemas. Exploitability through this application's paths and deployed environments was not tested.
- **Reproduction:** `npm audit --omit=dev`; inspect [advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). No exploit was run.
- **Expected / Actual:** No high-severity known vulnerable production dependency / audit identifies one. Application-specific exposure remains unknown.
- **Root cause:** config · `package.json` · dependency version falls in the advisory's affected range.
- **Proposed fix (not executed):** Evaluate a supported non-vulnerable Zod upgrade with schema compatibility and input-size limits; the suggested upgrade is a major version and needs migration review.
- **Fix acceptance:** audit no longer reports the advisory; import and event schema regression, bounded oversized input and memory tests pass.
- **Size:** M · **Fix risk:** medium

### AUD-013 — Public Worker rejects state payloads accepted by the Durable Object
- **Category:** Contract violation
- **Severity:** High · **Blocks learning today:** no
- **Confidence:** confirmed · **Verification:** VERIFIED
- **Refs affected:** main 7eeeef0 (executed); PR 91 59913b8 and PR 93 d1c730c (static inspection)
- **Location:** `worker/src/index.ts:130`; `worker/src/event-store.ts:742`; `src/sync/server-storage.ts:125`
- **Related:** A1 · A2 · A4 · A8 · E7 · G3
- **Evidence:** Three local Worker test runs sent a synthetic 300,000-byte value. Direct Durable Object state write returned 200; the authenticated public Worker path returned 413 before forwarding. The public proxy caps all request bodies at 250,000 bytes while the DO allows a 2,100,000-byte envelope and a 1,000,000-byte value. Actual user data size, loss, and real deployment behavior were not tested.
- **Reproduction:** Run `npx vitest run --config worker/test/audit/vitest.audit.config.ts worker/test/audit/state.proxy-limit.test.ts`. The test uses a fake verifier and isolated local DO.
- **Expected / Actual:** A state value within the documented internal limit should have a consistent public contract / public proxy rejects it with 413.
- **Root cause:** network / worker · `worker/src/index.ts:134` · shared body-size cap is applied to `/state` before the larger state-specific limit.
- **Proposed fix (not executed):** Align bounded route-specific limits and validation across proxy and DO, define an explicit supported maximum, and surface a recoverable client error without losing locally saved work.
- **Fix acceptance:** Boundary tests below, at and above the chosen byte limit, multibyte strings, authenticated public endpoint, retry/reload and oversized clear-error UX; confirm no unbounded memory use.
- **Size:** M · **Fix risk:** medium

### AUD-014 — Sync runtime sends queued events while local reset is pending
- **Category:** Data
- **Severity:** Blocker · **Blocks learning today:** yes
- **Confidence:** confirmed · **Verification:** VERIFIED
- **Refs affected:** main 7eeeef0 (executed); PR 93 d1c730c adds a reset-pending check (static inspection and separate existing unit tests, not this red test).
- **Location:** `src/sync/runtime.ts:265`; `src/sync/runtime.ts:295`
- **Related:** N2 · B1 · C1 · C6 · K2 · Related AUD-001 · Related AUD-009
- **Evidence:** Three local unit runs seeded one synthetic IndexedDB outbox event, set the local pending flag, set a synthetic token and invoked sync. A mock `/events` received one POST in each run. The mock accepted it; actual Worker lock, account state and whether this path occurs on the owner's phone were not exercised.
- **Reproduction:** Run `npx vitest run tests/audit/outbox.reset-pending.test.ts`. It invokes actual main runtime with a fake network and synthetic local data.
- **Expected / Actual:** No pending-reset learning writes leave the client until verified reconciliation / queued event is posted to the mock despite the local flag.
- **Root cause:** outbox · `src/sync/runtime.ts:265` · `syncNow` and its write request do not check the local reset guard.
- **Proposed fix (not executed):** Centralize the pending-reset guard for all write paths and in-flight races, preserve or reconcile queued events according to their creation epoch; evaluate PR 93's guard with dedicated tests before adopting it.
- **Fix acceptance:** Red test passes; pending guard tests cover startup, token refresh, wake, retry, pagehide and in-flight reset, with a local Worker verifying server lock and old generation rejection.
- **Size:** M · **Fix risk:** high

### AUD-015 — Import session JSON lacks the icon used by adjacent Data actions
- **Category:** UX
- **Severity:** Low · **Blocks learning today:** no
- **Confidence:** confirmed · **Verification:** VERIFIED
- **Refs affected:** main 7eeeef0 (local test); PR 93 d1c730c (local screenshot)
- **Location:** `src/app/exercise-menu.tsx:86`
- **Related:** N8 · I8 · K5
- **Evidence:** Three local mobile-320 Playwright runs found zero decorative SVG icons in the Import session JSON item; neighboring Data actions have icons. [Synthetic PR 93 screenshot](https://drive.google.com/file/d/17yrKftfZ7Xt6g5-2B3btmKxu3mpV-vOf/view) was visually inspected. This visual mismatch is separate from the unresolved keyboard failure in AUD-007.
- **Reproduction:** `npx playwright test e2e/audit/menu.import-icon.spec.ts --project=mobile-320 --workers=1`.
- **Expected / Actual:** Consistent Data action icon pattern / this item has no icon.
- **Root cause:** UI · `src/app/exercise-menu.tsx:86` · item is rendered as text without the decorative icon used by adjacent actions.
- **Proposed fix (not executed):** Add an appropriate shared decorative icon and preserve the accessible name and interaction behavior.
- **Fix acceptance:** Red test passes at mobile and desktop widths; keyboard and screen-reader names remain unchanged.
- **Size:** S · **Fix risk:** low

### AUD-016 — Standalone HTML fails to mount because production flag is undefined
- **Category:** Bug
- **Severity:** High · **Blocks learning today:** no
- **Confidence:** confirmed · **Verification:** VERIFIED
- **Refs affected:** main 7eeeef0 (executed); PR 91 59913b8 and PR 93 d1c730c (static inspection only)
- **Location:** `scripts/standalone.mjs:4`; `src/main.tsx:99`
- **Related:** G1 · G2 · L4 · K1
- **Evidence:** `npm run build` produced an esbuild warning that `import.meta` is empty in IIFE format. On isolated local HTTP with external requests blocked, the generated standalone page showed `Cannot read properties of undefined (reading 'PROD')` and the editor never mounted. Three browser runs of the red test failed to find Exercise menu. The separately built Vite Pages app was not affected by this observation.
- **Reproduction:** Run `npm run build`, then `npx playwright test --config e2e/audit/playwright.standalone.config.ts`. It serves `dist/standalone.html` locally and blocks all external requests.
- **Expected / Actual:** Standalone/offline HTML initializes the editor / startup catches a TypeError and renders an alert instead.
- **Root cause:** config · `scripts/standalone.mjs:4` · the IIFE esbuild define replaces `import.meta.env.DEV` but not `import.meta.env.PROD`, leaving `.env` undefined at startup.
- **Proposed fix (not executed):** Define production build-time flags consistently for standalone output and preserve intended local-reset semantics in an isolated environment.
- **Fix acceptance:** Standalone red test passes, offline smoke tests verify editor, storage reload and no unintended external requests; Vite Pages build remains green.
- **Size:** S · **Fix risk:** medium

### AUD-017 — Session imports replace current work without confirmation
- **Category:** Data
- **Severity:** Blocker · **Blocks learning today:** yes
- **Confidence:** confirmed · **Verification:** VERIFIED
- **Refs affected:** main 7eeeef0 (executed); PR 91 and PR 93 not independently tested
- **Location:** `src/app/practice-launcher.tsx:56`; `src/App.tsx:551`
- **Related:** G7 · G8 · test matrix Session/backup/import
- **Evidence:** Three local mobile browser runs entered a synthetic expression, pasted a different valid serialized session and pressed Restore. The previous expression was replaced immediately and no separate confirmation dialog appeared. The separate Import backup file flow produced the same replacement in three local mobile runs after the environment was restored. External requests were blocked. This demonstrates replacement of current UI state; durable recovery options and actual user's data were not examined.
- **Reproduction:** `npx playwright test e2e/audit/import.requires-confirmation.spec.ts e2e/audit/import.file-confirmation.spec.ts --project=mobile-390 --workers=1`. Both red tests expect existing work to remain until a confirmation is presented.
- **Expected / Actual:** A destructive session replacement requires a reviewable confirmation and preservation or backup path / valid JSON is loaded immediately when Restore is pressed.
- **Root cause:** UI / state · `src/app/practice-launcher.tsx:56` · both JSON-text and file-import handlers directly dispatch `actions.load` after parsing without an intervening confirmation or backup.
- **Proposed fix (not executed):** Preview consequences, provide an explicit cancel-first replacement confirmation, and offer a verified backup or recoverable undo before dispatching the replacement.
- **Fix acceptance:** Red test passes on mobile and desktop; cancel leaves current session intact, confirm replaces exactly once, and recovery from accidental import is verified.
- **Size:** M · **Fix risk:** medium

### AUD-018 — Unexpected mirror rejection aborts combined Cron result on main
- **Category:** Bug
- **Severity:** High · **Blocks learning today:** no
- **Confidence:** confirmed · **Verification:** VERIFIED
- **Refs affected:** main 7eeeef0 (executed); PR 91 59913b8 (static); PR 93 d1c730c contains allSettled and its analogous test passed.
- **Location:** `worker/src/event-store.ts:269`; `worker/src/index.ts:239`
- **Related:** N6 · E2 · E3 · K3
- **Evidence:** Three isolated Worker tests replaced Drive sync with a throwing synthetic function and Notion sync with a successful synthetic function. The combined `/internal/sync-all` request rejected instead of returning both destination results. The two tasks are started together; the test does not establish that the Notion task is cancelled. PR 93 existing `keeps cron mirror syncs independent...` test passed in its full Worker suite. The production Cron's actual failure reason and request count remain unknown.
- **Reproduction:** `npx vitest run --config worker/test/audit/vitest.audit.config.ts worker/test/audit/cron.isolates-mirror-failures.test.ts`.
- **Expected / Actual:** Unexpected failure in one mirror is converted to a sanitized per-destination error while the other result remains observable / Promise.all rejects the combined operation.
- **Root cause:** cron · `worker/src/event-store.ts:270` · the combined route awaits `Promise.all`, so a rejected promise rejects the whole response.
- **Proposed fix (not executed):** Evaluate PR 93's allSettled handling and bounded subrequest accounting, preserve independent results and retry diagnostics, and test on integrated release candidate.
- **Fix acceptance:** Red test passes; test both destinations throwing, successful peer completion, retry, sanitized logs, and subrequest budget across real mocked pagination.
- **Size:** M · **Fix risk:** medium

## 6. Findings summary table
| ID | Title | Category | Severity | Blocks learning today | Confidence | Verification | Refs | Location | Size |
|---|---|---|---|---|---|---|---|---|---|
| AUD-001 | Reset-pending state makes editor inert until authenticated cloud check | Bug | Blocker | yes | likely | NOT_TESTED | main 7eeeef0; PR 93 d1c730c | src/sync/server-connection-gate.tsx:135; src/main.tsx:42 | M |
| AUD-002 | Outbox initiates sync immediately instead of five-second trailing debounce | Contract violation | High | no | confirmed | VERIFIED | main 7eeeef0 | src/sync/runtime.ts:285 | M |
| AUD-003 | Exit and hidden-page flush are absent from main | Contract violation | Blocker | yes | likely | NOT_TESTED | main 7eeeef0 | src/sync/runtime.ts:102; src/sync/runtime.ts:292 | M |
| AUD-004 | Production Worker and Pages originate from different commits | Release | High | no | confirmed | VERIFIED | production; main 7eeeef0; PR 91 59913b8 | Worker deployment d376eafb-f0ab-42b9-8409-aab8f9bbaead; .github/workflows/pages.yml | M |
| AUD-005 | Scoped reset execution is not implemented | Missing | High | no | confirmed | VERIFIED | main 7eeeef0; PR 92 f384ca4 | worker/src/index.ts:219; PR 92 worker/src/index.ts:231 | L |
| AUD-006 | PR 93 replaced Enter with pointer click in AXE setup | CI/test | Medium | no | confirmed | VERIFIED | PR 93 d1c730c | e2e/accessibility/axe-states.spec.ts:20 | S |
| AUD-007 | Import session JSON loses Enter activation intermittently in the compact mobile menu | Accessibility/CI | High | no | confirmed | VERIFIED | main 7eeeef0; PR 91 59913b8; PR 93 d1c730c | src/app/exercise-menu.tsx:86, 123–130; e2e/ui-audit-regressions.spec.ts:103 | M |
| AUD-008 | PR 92 mobile-320 visual CI gate fails | CI/test | High | no | confirmed | VERIFIED | PR 92 f384ca4 | e2e/visual/mobile-layout.spec.ts:23 | M |
| AUD-009 | Distinct reset releases reuse a static epoch | Data | Blocker | yes | confirmed | VERIFIED | main 7eeeef0; PR 91 59913b8 and PR 93 d1c730c by static inspection only | src/sync/learning-reset-epoch.ts:1; worker/src/event-store.ts:244; worker/src/event-store.ts:419; src/sync/browser-db.ts:105 | L |
| AUD-010 | Reset selects Drive files by name without an ownership marker | Data | Critical | no | confirmed | VERIFIED | main 7eeeef0 (executed); PR 91 59913b8 and PR 92 f384ca4 (static inspection) | worker/src/event-store.ts:125; worker/src/event-store.ts:485 | L |
| AUD-011 | Reset clears Notion page references without external reconciliation | Data | High | no | confirmed | VERIFIED | main 7eeeef0 (executed); PR 91 59913b8 and PR 92 f384ca4 (static inspection) | worker/src/event-store.ts:371; worker/src/event-store.ts:532 | L |
| AUD-012 | Production dependency audit reports high-severity Zod advisory | Security | High | no | confirmed | VERIFIED | main 7eeeef0 | package.json; src/sync/learning-backup.ts:39 | M |
| AUD-013 | Public Worker rejects state payloads accepted by the Durable Object | Contract violation | High | no | confirmed | VERIFIED | main 7eeeef0 (executed); PR 91 59913b8 and PR 93 d1c730c (static inspection) | worker/src/index.ts:130; worker/src/event-store.ts:742; src/sync/server-storage.ts:125 | M |
| AUD-014 | Sync runtime sends queued events while local reset is pending | Data | Blocker | yes | confirmed | VERIFIED | main 7eeeef0 (executed); PR 93 d1c730c adds a reset-pending check (static inspection and separate existing unit tests, not this red test). | src/sync/runtime.ts:265; src/sync/runtime.ts:295 | M |
| AUD-015 | Import session JSON lacks the icon used by adjacent Data actions | UX | Low | no | confirmed | VERIFIED | main 7eeeef0 (local test); PR 93 d1c730c (local screenshot) | src/app/exercise-menu.tsx:86 | S |
| AUD-016 | Standalone HTML fails to mount because production flag is undefined | Bug | High | no | confirmed | VERIFIED | main 7eeeef0 (executed); PR 91 59913b8 and PR 93 d1c730c (static inspection only) | scripts/standalone.mjs:4; src/main.tsx:99 | S |
| AUD-017 | Session imports replace current work without confirmation | Data | Blocker | yes | confirmed | VERIFIED | main 7eeeef0 (executed); PR 91 and PR 93 not independently tested | src/app/practice-launcher.tsx:56; src/App.tsx:551 | M |
| AUD-018 | Unexpected mirror rejection aborts combined Cron result on main | Bug | High | no | confirmed | VERIFIED | main 7eeeef0 (executed); PR 91 59913b8 (static); PR 93 d1c730c contains allSettled and its analogous test passed. | worker/src/event-store.ts:269; worker/src/index.ts:239 | M |

## Notion read-only aggregate observations
On 2026-11-13, aggregate counts from configured sources: Math Attempts 5; Mistakes 0; Concepts 0; Daily Reports 0. These are entire data-source counts, not proof of project ownership, deletion eligibility, or the age/type of the rows. Sessions is a shared core database; it was not counted because that could include protected Pomodoro records and no validated filter was established. No row contents were read or changed. See AUD-011.


## 7. Known issues K1–K8
- K1: NOT_TESTED — main One Tap path has a 30-second timeout at src/sync/google-id-token.ts:185; PR 93 separates identity and Drive flows, but the owner’s actual timeout cause and effective fix remain unverified. See AUD-001.
- K2: NOT_TESTED — root cause / actual production behavior not established; requires dedicated tests and live-safe evidence.
- K3: NOT_TESTED — actual production Cron error remains unknown. An unexpected rejection causes main combined request to fail (AUD-018); PR 93 equivalent isolated test passed.
- K4: NOT_TESTED — ownership and shared Sessions remain unresolved; aggregate Math Attempts count is 5, local reference deletion is confirmed in AUD-011, filename-only Drive selection in AUD-010.
- K5: FAILED — Import session JSON lost keyboard focus before Enter on 4/5 repeated 320 px runs; complete item matrix and exact root cause remain NOT_TESTED (AUD-007).
- K6: FAILED — local main Worker scoped execute route returns 404 (AUD-005); PR 92 is static-only and production was not probed.
- K7: NOT_TESTED — root cause / actual production behavior not established; see AUD-004.
- K8: FAILED — main mocked runtime violates 5-second debounce (AUD-002); full production behavior and exit flush remain untested (AUD-003).

## 8. Contract & requirements

### Route map (main, static only)
| Method | Public path | Authentication | Contract notes |
|---|---|---|---|
| GET | /health | none | returns service/ok; no SHA |
| POST | /session | Google ID | issues Worker session |
| POST | /session/revoke | owner | revokes session |
| POST | /admin/learning-reset; /admin/learning-reset/release | admin secret | bounded 4096-byte request; production not called |
| GET | /admin/learning-reset/status | absent on main; admin secret on deployed PR 91 | live read-only request without token returned 401; no authenticated request (AUD-004) |
| POST | /events; /state | owner | epoch header; public proxy body limit 250000 bytes, AUD-013 |
| GET | /state; /sync; /snapshot; /reset/preview | owner | query forwarded to Durable Object |
| GET/POST | /drive/status, /drive/sync; /notion/status, /notion/sync | owner | mirror operations |
| POST/GET | /bank/source; /bank/meta; /bank/content | owner | protected source; no live read |
| POST | /reset/execute | absent | AUD-005 |

### Durable Object SQLite schema (static source review)
Production DB contents were not queried. Constructor DDL defines:
- sync_health(destination PK, status, pending_count, last_error, last_synced_at, updated_at)
- mirror_diagnostics(destination PK, failure_stage, error_code, updated_at)
- mirror_configuration(destination PK, configured, updated_at)
- app_state(key PK, value, revision, updated_at); app_state_meta(singleton CHECK=1 PK, revision)
- notion_projections(projection_type, projection_key composite PK, projection_json); notion_projection_meta(singleton CHECK=1 PK, last_seq)
- notion_page_refs(kind, external_key composite PK, page_id); notion_state_queue(key PK, revision)
- notion_mistake_reviews(item_key PK, event_id, review_successes, last_review_event_id); notion_session_mistakes(session_id, page_id composite PK)
- learning_events(seq AUTOINCREMENT PK, event_id UNIQUE NOT NULL, event_json, event_ts)
- auth_sessions(token_hash PK, email, sub, created_at, expires_at, revoked_at)
- bank_source(singleton CHECK=1 PK, file_id, file_name, registered_at)
- rate_windows(window_start PK, request_count)
- learning_reset_control(singleton CHECK=1 PK, status, reset_id, completed_at, client_epoch)
No secondary CREATE INDEX statements were found; uniqueness is supplied by primary keys and learning_events.event_id. Wrangler config declares Durable Object migration v1; constructor DDL creates missing tables and adds client_epoch when absent. This is a static inventory, not a production-schema verification.

### Reset state machines (static only)
- Client: production startup detects a changed local reset epoch → writes reset-pending guard → clears local learning keys → records the epoch → withholds the sync token while pending → editor is inert and status banner remains. Only completeLocalLearningReset clears the guard after server confirmation; no phone-only recovery path was found (AUD-001). Local/development startup intentionally does not run the production reset.
- Worker: idle/released → running (claims resetId and waits for active work) → awaiting_release after local DO/mirror reset work → released when the admin release stores the configured epoch. Same-ID retry can resume a running reset; a different ID while running returns 409; same-ID release is accepted idempotently. A caught reset error returns 502 while leaving the row running, so retry must reuse that resetId. Separate completed resets still reuse the configured epoch (AUD-009).

Full request/response/error contract and duplicate type comparison: NOT_TESTED.

- N1: FAILED — debounce behavior failed in three mocked local runs (AUD-002); exit flush static gap AUD-003; full browser/real Worker validation remains incomplete.
- N2: FAILED — two complete local Worker resets allowed an old event (AUD-009); external mirror reconciliation and real-device behavior remain NOT_TESTED; see AUD-001 and AUD-014.
- N3: FAILED — local main Worker scoped execute route returns 404 (AUD-005); preview correctness and PR 92 runtime remain NOT_TESTED.
- N4: FAILED — local fake Drive test selected unmarked file, AUD-010; Notion cleanup/reconciliation gap AUD-011.
- N5: NOT_TESTED — full behavioral coverage incomplete; requires dedicated validation.
- N6: FAILED — unexpected rejection fails combined Cron route on main (AUD-018); complete subrequest accounting remains NOT_TESTED.
- N7: FAILED — Worker deployment and Pages release identify different source commits; see AUD-004.
- N8: FAILED — Import session JSON Enter activation intermittently failed on 320 px (AUD-007); full all-item Enter/Space matrix remains NOT_TESTED.

## 9. Review checklist
Each code records a narrow executed failure or an explicit limitation; NOT_TESTED means no complete check, even if some static evidence exists.
- A1: NOT_TESTED — full behavior or coverage not established in this run.
- A2: FAILED — AUD-013
- A3: NOT_TESTED — full behavior or coverage not established in this run.
- A4: FAILED — AUD-013
- A5: NOT_TESTED — full behavior or coverage not established in this run.
- A6: NOT_TESTED — full behavior or coverage not established in this run.
- A7: NOT_TESTED — full behavior or coverage not established in this run.
- A8: NOT_TESTED — full behavior or coverage not established in this run.
- A9: NOT_TESTED — full behavior or coverage not established in this run.
- B1: NOT_TESTED — full behavior or coverage not established in this run.
- B2: FAILED — AUD-002
- B3: NOT_TESTED — full behavior or coverage not established in this run.
- B4: NOT_TESTED — full behavior or coverage not established in this run.
- B5: NOT_TESTED — full behavior or coverage not established in this run.
- B6: NOT_TESTED — full behavior or coverage not established in this run.
- B7: NOT_TESTED — full behavior or coverage not established in this run.
- B8: NOT_TESTED — full behavior or coverage not established in this run.
- B9: NOT_TESTED — full behavior or coverage not established in this run.
- B10: NOT_TESTED — full behavior or coverage not established in this run.
- B11: NOT_TESTED — full behavior or coverage not established in this run.
- B12: NOT_TESTED — full behavior or coverage not established in this run.
- B13: NOT_TESTED — full behavior or coverage not established in this run.
- B14: NOT_TESTED — full behavior or coverage not established in this run.
- C1: FAILED — AUD-014
- C2: NOT_TESTED — full behavior or coverage not established in this run.
- C3: NOT_TESTED — full behavior or coverage not established in this run.
- C4: NOT_TESTED — full behavior or coverage not established in this run.
- C5: FAILED — AUD-009
- C6: NOT_TESTED — full behavior or coverage not established in this run.
- C7: NOT_TESTED — full behavior or coverage not established in this run.
- C8: FAILED — AUD-011
- C9: FAILED — main scoped execute route returned 404 in three local synthetic runs (AUD-005); PR 92 runtime remains NOT_TESTED.
- C10: NOT_TESTED — full behavior or coverage not established in this run.
- D1: NOT_TESTED — full behavior or coverage not established in this run.
- D2: NOT_TESTED — full behavior or coverage not established in this run.
- D3: NOT_TESTED — full behavior or coverage not established in this run.
- D4: NOT_TESTED — full behavior or coverage not established in this run.
- D5: NOT_TESTED — full behavior or coverage not established in this run.
- D6: NOT_TESTED — full behavior or coverage not established in this run.
- D7: NOT_TESTED — full behavior or coverage not established in this run.
- D8: NOT_TESTED — full behavior or coverage not established in this run.
- D9: NOT_TESTED — full behavior or coverage not established in this run.
- D10: NOT_TESTED — full behavior or coverage not established in this run.
- D11: NOT_TESTED — full behavior or coverage not established in this run.
- E1: NOT_TESTED — full behavior or coverage not established in this run.
- E2: FAILED — synthetic mirror rejection aborts combined response on main; AUD-018.
- E3: NOT_TESTED — full behavior or coverage not established in this run.
- E4: NOT_TESTED — full behavior or coverage not established in this run.
- E5: NOT_TESTED — full behavior or coverage not established in this run.
- E6: NOT_TESTED — full behavior or coverage not established in this run.
- E7: FAILED — AUD-013
- E8: NOT_TESTED — full behavior or coverage not established in this run.
- E9: NOT_TESTED — full behavior or coverage not established in this run.
- E10: NOT_TESTED — full behavior or coverage not established in this run.
- E11: NOT_TESTED — full behavior or coverage not established in this run.
- F1: FAILED — AUD-010
- F2: FAILED — AUD-010
- F3: NOT_TESTED — full behavior or coverage not established in this run.
- F4: NOT_TESTED — full behavior or coverage not established in this run.
- F5: NOT_TESTED — full behavior or coverage not established in this run.
- F6: NOT_TESTED — full behavior or coverage not established in this run.
- F7: NOT_TESTED — full behavior or coverage not established in this run.
- F8: NOT_TESTED — full behavior or coverage not established in this run.
- F9: NOT_TESTED — full behavior or coverage not established in this run.
- G1: NOT_TESTED — full behavior or coverage not established in this run.
- G2: NOT_TESTED — full behavior or coverage not established in this run.
- G3: NOT_TESTED — full behavior or coverage not established in this run.
- G4: NOT_TESTED — full behavior or coverage not established in this run.
- G5: NOT_TESTED — full behavior or coverage not established in this run.
- G6: NOT_TESTED — full behavior or coverage not established in this run.
- G7: FAILED — Import backup file replaced synthetic current work without confirmation (AUD-017); complete backup journeys remain NOT_TESTED.
- G8: FAILED — Import session JSON replaced synthetic current work without confirmation (AUD-017); invalid-input subset is separately covered.
- G9: NOT_TESTED — full behavior or coverage not established in this run.
- G10: NOT_TESTED — full behavior or coverage not established in this run.
- H1: NOT_TESTED — full behavior or coverage not established in this run.
- H2: NOT_TESTED — full behavior or coverage not established in this run.
- H3: NOT_TESTED — full behavior or coverage not established in this run.
- H4: NOT_TESTED — full behavior or coverage not established in this run.
- H5: NOT_TESTED — full behavior or coverage not established in this run.
- H6: NOT_TESTED — full behavior or coverage not established in this run.
- H7: NOT_TESTED — full behavior or coverage not established in this run.
- H8: NOT_TESTED — full behavior or coverage not established in this run.
- I1: NOT_TESTED — full behavior or coverage not established in this run.
- I2: FAILED — Import session JSON Enter activation intermittently failed on Pixel 7 emulation at 320 px (AUD-007); all menu items remain NOT_TESTED.
- I3: VERIFIED — Escape closed the opened menu in the focused audit spec on both 320 px Pixel 7 and desktop; this does not cover every menu state.
- I4: VERIFIED — the focused audit spec observed Escape returning focus to the Exercise menu button on both 320 px Pixel 7 and desktop.
- I5: NOT_TESTED — full behavior or coverage not established in this run.
- I6: NOT_TESTED — full behavior or coverage not established in this run.
- I7: NOT_TESTED — full behavior or coverage not established in this run.
- I8: FAILED — AUD-015
- J1: NOT_TESTED — full behavior or coverage not established in this run.
- J2: NOT_TESTED — full behavior or coverage not established in this run.
- J3: NOT_TESTED — full behavior or coverage not established in this run.
- J4: NOT_TESTED — full behavior or coverage not established in this run.
- J5: NOT_TESTED — full behavior or coverage not established in this run.
- J6: NOT_TESTED — full behavior or coverage not established in this run.
- J7: FAILED — AUD-012
- K1: NOT_TESTED — full behavior or coverage not established in this run.
- K2: NOT_TESTED — full behavior or coverage not established in this run.
- K3: NOT_TESTED — full behavior or coverage not established in this run.
- K4: NOT_TESTED — full behavior or coverage not established in this run.
- L1: NOT_TESTED — full behavior or coverage not established in this run.
- L2: FAILED — AUD-006
- L3: FAILED — AUD-008
- L4: NOT_TESTED — full behavior or coverage not established in this run.
- L5: FAILED — AUD-004
- L6: NOT_TESTED — full behavior or coverage not established in this run.
- L7: NOT_TESTED — full behavior or coverage not established in this run.
- L8: NOT_TESTED — full behavior or coverage not established in this run.

## 10. Browser scenarios
- S1: NOT_TESTED — local 320, Pixel 7 and desktop had no pageerror or horizontal overflow and the menu opened; console errors and the full menu were not completely exercised. See e2e/audit/layout.initial.spec.ts.
- S2: BLOCKED — Chapter 1 bank and lesson content are protected by R5; only synthetic lesson fixtures were used. Unblock only with a safe synthetic copy of the bank.
- S3: FAILED — a one-event synthetic probe sent POST after about 4 ms instead of the required 5-second idle delay (AUD-002); the exact five-answer batching sequence remains NOT_TESTED.
- S4: NOT_TESTED — no 40-second continuous-event/max-wait run; fake clock coverage is still needed.
- S5: NOT_TESTED — no tab-close run against a local Worker. Static main handler onPageHide is empty (AUD-003); static inspection is not behavioral evidence.
- S6: NOT_TESTED — offline mock queued one synthetic edit and flushed on reconnect; the specified three-answer setOffline sequence and no-duplicate check were not run.
- S7: VERIFIED — local Worker test resent one synthetic event batch and found one row, rejecting the same ID with changed content. Multi-event and concurrent retry coverage remains NOT_TESTED; see worker/tests/sync-worker.test.ts.
- S8: NOT_TESTED — no two-browser-context convergence run; desktop local-storage conflict subset is not equivalent.
- S9: FAILED — two local Worker resets followed by an old-generation event admitted stale data (AUD-009). Browser tab, counter and full external mirror aspects remain NOT_TESTED.
- S10: VERIFIED — the PR 91 local Worker suite exercised synthetic orphaned lock takeover and release; actual production lock takeover and browser UX remain NOT_TESTED.
- S11: NOT_TESTED — main route returns 404 for execute (AUD-005), but scoped preview counts and a full preview→confirm journey were not tested.
- S12: FAILED — Import session JSON Enter lost focus before key delivery on 4/5 repeated 320 px tests; desktop 5/5 passed. Space/Escape subset passed once; all remaining items and click states remain NOT_TESTED. AUD-007.
- S13: VERIFIED — mobile-390 local browser tested malformed JSON, a 1,000,001-character input and one script-bearing malformed object; visible errors and no execution were observed. Desktop and other payloads remain NOT_TESTED. See e2e/audit/import.invalid-inputs.spec.ts.
- S14: NOT_TESTED — backup fixture passed after IndexedDB was cleared, but the specified Reset all local storage → import journey was not run.
- S15: NOT_TESTED — no End session/reset action was confirmed in the local app and no event was verified for that complete journey.
- S16: NOT_TESTED — three mocked PR 93 browser cases passed, but popup-closed, blocked, timeout, access_denied and Drive-before-await coverage was not complete.
- S17: BLOCKED — invoking local Cron can enter Drive/Notion mirror code; no fully isolated scheduled-trigger harness was available in this audit, and no outbound mirror POST was attempted. Unblock with a local scheduled test whose external fetches are all stubbed.
- S18: BLOCKED — production page navigation failed twice with ERR_EMPTY_RESPONSE; only read-only HEAD available. The separate nine AXE tests do not establish these scenarios.
- Real Google sign-in: BLOCKED — owner-only; no account sign-in was attempted.

### Test matrix coverage
Each complete row below is NOT_TESTED unless otherwise stated; partial results do not prove the whole row.
- Learning flow: NOT_TESTED — sample fixture passed; actual Chapter 1 and cross-device path remain untested.
- Outbox/event queue: FAILED — debounce AUD-002; offline reconnect mock passed; remaining assertions incomplete.
- Exit flush: NOT_TESTED — static absence on main AUD-003.
- Full reset, lock, epoch: FAILED — local reset/old event AUD-009 and pending guard AUD-014; phone and external services untested.
- Google sign-in/Drive: NOT_TESTED — mocked PR 93 units only; real sign-in owner-only.
- Worker routes: FAILED — state limit AUD-013; complete contract incomplete.
- Cron: FAILED — local unexpected-rejection isolation test failed, AUD-018; production failure cause and subrequest count remain unknown.
- Drive/Notion adapters: FAILED — synthetic reset ownership and references AUD-010/011; live effects not touched.
- Scoped reset: FAILED — local main route returns 404 (AUD-005); safe end-to-end execution remains untested.
- Multi-device: NOT_TESTED — desktop local-storage conflict tests pass, full convergence untested.
- Session, backup, import: FAILED — destructive JSON replacement has no confirmation (AUD-017); backup fixture passed, full matrix incomplete.
- Menu and accessibility: FAILED — Enter activation of Import session JSON failed intermittently on 320 px (AUD-007); other menu items and complete accessibility matrix remain NOT_TESTED.
- Theme and layout: NOT_TESTED — partial 320/mobile tests passed; full visual matrix absent.
- Offline/network errors: NOT_TESTED — mocked reconnect passed, chaos matrix incomplete.
- Release: FAILED — deployment SHA mismatch AUD-004.
- Performance/security: FAILED — high npm advisory AUD-012. Isolated Lighthouse and scoped secret scans ran; production exploitability, field performance and key restrictions remain NOT_TESTED.

## 11. PR analysis & merge order
PR 92 is stacked on PR 91. Pairwise git merge-tree for 91/93, 92/93, 91/92 returned exit 0, but semantic compatibility was not tested. Recommended order: review/fix PR 91 and its unresolved runtime/CI evidence; then PR 92 after reset-scope isolation; handle PR 93 independently because its test edits overlap with UI/accessibility concerns; integrate and test one SHA. This is a proposed sequence, not merge authorization.
Minimum safe change set to start learning today cannot be declared from this audit: the reset/epoch/outbox blockers, destructive import behavior, CI failures, and Pages/Worker drift remain unresolved. Do not infer that any current PR is ready to merge.

## 12. Proposed fix plan

### Stage 1 — blockers
1. Align the pending-reset guard, monotonically distinct reset epochs and event rejection (AUD-001, AUD-009, AUD-014); verify lock recovery without deleting local work.
2. Repair the outbox debounce and exit/hidden-page flush contract (AUD-002, AUD-003); verify local persistence, retry ordering and no duplicate delivery.
3. Add an explicit safe confirmation before either import path replaces current work (AUD-017).
4. Only after those fixes, verify the phone and desktop learning path against synthetic data and a same-SHA Worker.

### Stage 2 — critical and high
Resolve the state-size proxy mismatch (AUD-013), missing scoped execute route (AUD-005), ownership/reconciliation gaps (AUD-010/011), standalone launch (AUD-016), Cron failure isolation (AUD-018), production dependency advisory (AUD-012), CI failures (AUD-007/008), and deployment drift (AUD-004). Keep PR 92 scope operations isolated and idempotent.

### Stage 3 — remaining
Review the public browser key restrictions, improve menu icon/keyboard behavior (AUD-015/AUD-007), measure field performance, complete route/error contracts, and finish device/accessibility scenarios.

### Release gates
- Typecheck, unit, Worker, integration and full Playwright suites pass on the exact integrated SHA; no unexplained skips or weakened keyboard assertions.
- All Blocker fixes pass synthetic two-device/outbox/reset/import tests; no production data used by those tests.
- Pages and Worker identify the same SHA; health reports the deployed SHA and the observed deployment matches it.
- Mobile 320 px, Pixel 7 and desktop accessibility/visual checks pass; keyboard Enter, Space and Escape are repeatable.
- Security review resolves or explicitly accepts the high dependency advisory and verifies browser API key restrictions before release.

### Owner phone checklist before starting
1. Keep current browser storage and app data intact.
2. Do not use Reset all local storage, import a session, or trigger cloud reset while the pending-reset banner is visible.
3. Do not answer lessons on this phone until the pending state is cleared through a verified recovery and the app reports a connected, stable state.
4. After an audited release, open the Pages app and confirm the reset banner is gone before starting a lesson. No terminal action is required.

### Performance and secret scan
- Local Lighthouse single runs, production build served on loopback with all HTTPS requests blocked: mobile performance 88/100, LCP 3.82 s, TBT 68 ms, CLS 0.032; desktop 100/100, LCP 0.76 s, TBT 0 ms, CLS 0.003. These are isolated lab measurements, not production field data or a statistically representative benchmark.
- Main built primary JavaScript: 1,622,724 bytes raw, 471,350 gzip; `dist/assets` approximately 7.2 MiB including maps and fonts.
- Gitleaks 8.30.1 scanned local reachable Git history: one Google browser API key match in `src/features/drive-bank/drive-config.ts` at historical commit 85da3f64; the code labels it a public key restricted to Pages and Picker. Actual Cloud Console restrictions and usage cannot be verified here. No key value is included in this report. Scan of audit Markdown and audit test directories reported zero findings. Full history/ref completeness and key restrictions remain NOT_TESTED.

## 13. Owner-only actions & open items
No safe user action has been verified to remove the pending lock. Do not start by clearing app storage or triggering reset. Google Cloud checklist when appropriate: verify browser API key HTTP-referrer and API restrictions, authorized Pages/localhost JavaScript origins, OAuth consent publishing state and test users, required Drive scopes, and Pages COOP behavior. Do not share credentials.

## 14. Appendix
Audit branch: audit/full-20261113-1015. Latest remote checkpoint before finalization: f7abae1fe9d5b874a9d611f126df661ee21ea020; the linked branch contains later final-report commits. Evidence sources: source at pinned SHAs, current GitHub job logs linked above, local command outputs summarized in section 3. Red tests: worker/test/audit/reset.epoch.second-release.test.ts, reset.stale-event.second-release.test.ts and reset.stale-event.two-full-resets.test.ts (run command in AUD-009). Synthetic screenshot is linked in AUD-015; production user-data verification and full security review remain NOT_TESTED. `npm audit` found one high advisory (AUD-012). HEAD requests to Pages and Worker observed HSTS on Pages and did not expose CSP/COOP in the returned headers; security impact and all response paths were NOT_TESTED. Final structural self-check PASS: 18/18 findings aligned across detail, summary and machine index; severity counts 5/1/10/1/1; A–L 109, N 8, K 8, S 18, test matrix 16; scoped gitleaks scans clean. No secrets or raw traces included.

## 15. Machine index
```json
[
  {
    "id": "AUD-001",
    "title": "Reset-pending state makes editor inert until authenticated cloud check",
    "category": "Bug",
    "severity": "Blocker",
    "blocker": true,
    "confidence": "likely",
    "verification": "NOT_TESTED",
    "refs": [
      "main 7eeeef0; PR 93 d1c730c"
    ],
    "location": "src/sync/server-connection-gate.tsx:135; src/main.tsx:42",
    "requirements": [
      "C1",
      "C6",
      "H8",
      "K1",
      "N2"
    ],
    "root_cause_layer": "state",
    "red_test": "",
    "run_cmd": "",
    "depends_on": [],
    "size": "M",
    "fix_risk": "high"
  },
  {
    "id": "AUD-002",
    "title": "Outbox initiates sync immediately instead of five-second trailing debounce",
    "category": "Contract violation",
    "severity": "High",
    "blocker": false,
    "confidence": "confirmed",
    "verification": "VERIFIED",
    "refs": [
      "main 7eeeef0"
    ],
    "location": "src/sync/runtime.ts:285",
    "requirements": [
      "N1",
      "B2",
      "B3",
      "B4",
      "K8"
    ],
    "root_cause_layer": "outbox",
    "red_test": "tests/audit/outbox.debounce.test.ts",
    "run_cmd": "npx vitest run tests/audit/outbox.debounce.test.ts",
    "depends_on": [],
    "size": "M",
    "fix_risk": "medium"
  },
  {
    "id": "AUD-003",
    "title": "Exit and hidden-page flush are absent from main",
    "category": "Contract violation",
    "severity": "Blocker",
    "blocker": true,
    "confidence": "likely",
    "verification": "NOT_TESTED",
    "refs": [
      "main 7eeeef0"
    ],
    "location": "src/sync/runtime.ts:102; src/sync/runtime.ts:292",
    "requirements": [
      "N1",
      "B5",
      "B6",
      "K8"
    ],
    "root_cause_layer": "outbox",
    "red_test": "",
    "run_cmd": "",
    "depends_on": [],
    "size": "M",
    "fix_risk": "high"
  },
  {
    "id": "AUD-004",
    "title": "Production Worker and Pages originate from different commits",
    "category": "Release",
    "severity": "High",
    "blocker": false,
    "confidence": "confirmed",
    "verification": "VERIFIED",
    "refs": [
      "production; main 7eeeef0; PR 91 59913b8"
    ],
    "location": "Worker deployment d376eafb-f0ab-42b9-8409-aab8f9bbaead; .github/workflows/pages.yml",
    "requirements": [
      "N7",
      "L5",
      "L7",
      "K7"
    ],
    "root_cause_layer": "config",
    "red_test": "",
    "run_cmd": "",
    "depends_on": [],
    "size": "M",
    "fix_risk": "high"
  },
  {
    "id": "AUD-005",
    "title": "Scoped reset execution is not implemented",
    "category": "Missing",
    "severity": "High",
    "blocker": false,
    "confidence": "confirmed",
    "verification": "VERIFIED",
    "refs": [
      "main 7eeeef0; PR 92 f384ca4"
    ],
    "location": "worker/src/index.ts:219; PR 92 worker/src/index.ts:231",
    "requirements": [
      "N3",
      "C9",
      "K6"
    ],
    "root_cause_layer": "worker",
    "red_test": "worker/test/audit/reset.scoped-execute-route.test.ts",
    "run_cmd": "npx vitest run --config worker/test/audit/vitest.audit.config.ts worker/test/audit/reset.scoped-execute-route.test.ts",
    "depends_on": [],
    "size": "L",
    "fix_risk": "high"
  },
  {
    "id": "AUD-006",
    "title": "PR 93 replaced Enter with pointer click in AXE setup",
    "category": "CI/test",
    "severity": "Medium",
    "blocker": false,
    "confidence": "confirmed",
    "verification": "VERIFIED",
    "refs": [
      "PR 93 d1c730c"
    ],
    "location": "e2e/accessibility/axe-states.spec.ts:20",
    "requirements": [
      "K5",
      "I2",
      "L2"
    ],
    "root_cause_layer": "test",
    "red_test": "",
    "run_cmd": "",
    "depends_on": [],
    "size": "S",
    "fix_risk": "low"
  },
  {
    "id": "AUD-007",
    "title": "Import session JSON loses Enter activation intermittently in the compact mobile menu",
    "category": "Accessibility/CI",
    "severity": "High",
    "blocker": false,
    "confidence": "confirmed",
    "verification": "VERIFIED",
    "refs": [
      "main 7eeeef0; PR 91 59913b8; PR 93 d1c730c"
    ],
    "location": "src/app/exercise-menu.tsx:86, 123–130; e2e/ui-audit-regressions.spec.ts:103",
    "requirements": [
      "N8",
      "K5",
      "I2",
      "L3",
      "L4"
    ],
    "root_cause_layer": "UI accessibility (likely compact-menu focus management; exact transition unisolated)",
    "red_test": "e2e/audit/menu.keyboard.spec.ts",
    "run_cmd": "npx playwright test --config e2e/audit/playwright.keyboard.config.ts -g 'menu.import-json.opens-with-Enter' --workers=1 --repeat-each=5",
    "depends_on": [],
    "size": "M",
    "fix_risk": "medium"
  },
  {
    "id": "AUD-008",
    "title": "PR 92 mobile-320 visual CI gate fails",
    "category": "CI/test",
    "severity": "High",
    "blocker": false,
    "confidence": "confirmed",
    "verification": "VERIFIED",
    "refs": [
      "PR 92 f384ca4"
    ],
    "location": "e2e/visual/mobile-layout.spec.ts:23",
    "requirements": [
      "H1",
      "L3"
    ],
    "root_cause_layer": "CI",
    "red_test": "",
    "run_cmd": "",
    "depends_on": [],
    "size": "M",
    "fix_risk": "medium"
  },
  {
    "id": "AUD-009",
    "title": "Distinct reset releases reuse a static epoch",
    "category": "Data",
    "severity": "Blocker",
    "blocker": true,
    "confidence": "confirmed",
    "verification": "VERIFIED",
    "refs": [
      "main 7eeeef0; PR 91 59913b8 and PR 93 d1c730c by static inspection only"
    ],
    "location": "src/sync/learning-reset-epoch.ts:1; worker/src/event-store.ts:244; worker/src/event-store.ts:419; src/sync/browser-db.ts:105",
    "requirements": [
      "N2",
      "C5",
      "C7",
      "B11"
    ],
    "root_cause_layer": "worker",
    "red_test": "worker/test/audit/reset.stale-event.two-full-resets.test.ts",
    "run_cmd": "npx vitest run --config worker/test/audit/vitest.audit.config.ts worker/test/audit/reset.stale-event.two-full-resets.test.ts",
    "depends_on": [],
    "size": "L",
    "fix_risk": "high"
  },
  {
    "id": "AUD-010",
    "title": "Reset selects Drive files by name without an ownership marker",
    "category": "Data",
    "severity": "Critical",
    "blocker": false,
    "confidence": "confirmed",
    "verification": "VERIFIED",
    "refs": [
      "main 7eeeef0 (executed); PR 91 59913b8 and PR 92 f384ca4 (static inspection)"
    ],
    "location": "worker/src/event-store.ts:125; worker/src/event-store.ts:485",
    "requirements": [
      "N4",
      "F1",
      "F2",
      "F3",
      "K4"
    ],
    "root_cause_layer": "drive",
    "red_test": "worker/test/audit/reset.ownership-and-notion.test.ts",
    "run_cmd": "npx vitest run --config worker/test/audit/vitest.audit.config.ts worker/test/audit/reset.ownership-and-notion.test.ts",
    "depends_on": [],
    "size": "L",
    "fix_risk": "high"
  },
  {
    "id": "AUD-011",
    "title": "Reset clears Notion page references without external reconciliation",
    "category": "Data",
    "severity": "High",
    "blocker": false,
    "confidence": "confirmed",
    "verification": "VERIFIED",
    "refs": [
      "main 7eeeef0 (executed); PR 91 59913b8 and PR 92 f384ca4 (static inspection)"
    ],
    "location": "worker/src/event-store.ts:371; worker/src/event-store.ts:532",
    "requirements": [
      "N4",
      "F1",
      "C8",
      "K4"
    ],
    "root_cause_layer": "notion",
    "red_test": "worker/test/audit/reset.ownership-and-notion.test.ts",
    "run_cmd": "npx vitest run --config worker/test/audit/vitest.audit.config.ts worker/test/audit/reset.ownership-and-notion.test.ts",
    "depends_on": [],
    "size": "L",
    "fix_risk": "high"
  },
  {
    "id": "AUD-012",
    "title": "Production dependency audit reports high-severity Zod advisory",
    "category": "Security",
    "severity": "High",
    "blocker": false,
    "confidence": "confirmed",
    "verification": "VERIFIED",
    "refs": [
      "main 7eeeef0"
    ],
    "location": "package.json; src/sync/learning-backup.ts:39",
    "requirements": [
      "J7",
      "J3"
    ],
    "root_cause_layer": "config",
    "red_test": "",
    "run_cmd": "npm audit --omit=dev",
    "depends_on": [],
    "size": "M",
    "fix_risk": "medium"
  },
  {
    "id": "AUD-013",
    "title": "Public Worker rejects state payloads accepted by the Durable Object",
    "category": "Contract violation",
    "severity": "High",
    "blocker": false,
    "confidence": "confirmed",
    "verification": "VERIFIED",
    "refs": [
      "main 7eeeef0 (executed); PR 91 59913b8 and PR 93 d1c730c (static inspection)"
    ],
    "location": "worker/src/index.ts:130; worker/src/event-store.ts:742; src/sync/server-storage.ts:125",
    "requirements": [
      "A1",
      "A2",
      "A4",
      "A8",
      "E7",
      "G3"
    ],
    "root_cause_layer": "worker",
    "red_test": "worker/test/audit/state.proxy-limit.test.ts",
    "run_cmd": "npx vitest run --config worker/test/audit/vitest.audit.config.ts worker/test/audit/state.proxy-limit.test.ts",
    "depends_on": [],
    "size": "M",
    "fix_risk": "medium"
  },
  {
    "id": "AUD-014",
    "title": "Sync runtime sends queued events while local reset is pending",
    "category": "Data",
    "severity": "Blocker",
    "blocker": true,
    "confidence": "confirmed",
    "verification": "VERIFIED",
    "refs": [
      "main 7eeeef0 (executed); PR 93 d1c730c adds a reset-pending check (static inspection and separate existing unit tests, not this red test)."
    ],
    "location": "src/sync/runtime.ts:265; src/sync/runtime.ts:295",
    "requirements": [
      "N2",
      "B1",
      "C1",
      "C6",
      "K2"
    ],
    "root_cause_layer": "outbox",
    "red_test": "tests/audit/outbox.reset-pending.test.ts",
    "run_cmd": "npx vitest run tests/audit/outbox.reset-pending.test.ts",
    "depends_on": [],
    "size": "M",
    "fix_risk": "high"
  },
  {
    "id": "AUD-015",
    "title": "Import session JSON lacks the icon used by adjacent Data actions",
    "category": "UX",
    "severity": "Low",
    "blocker": false,
    "confidence": "confirmed",
    "verification": "VERIFIED",
    "refs": [
      "main 7eeeef0 (local test); PR 93 d1c730c (local screenshot)"
    ],
    "location": "src/app/exercise-menu.tsx:86",
    "requirements": [
      "N8",
      "I8",
      "K5"
    ],
    "root_cause_layer": "UI",
    "red_test": "e2e/audit/menu.import-icon.spec.ts",
    "run_cmd": "npx playwright test e2e/audit/menu.import-icon.spec.ts --project=mobile-320 --workers=1",
    "depends_on": [],
    "size": "S",
    "fix_risk": "low"
  },
  {
    "id": "AUD-016",
    "title": "Standalone HTML fails to mount because production flag is undefined",
    "category": "Bug",
    "severity": "High",
    "blocker": false,
    "confidence": "confirmed",
    "verification": "VERIFIED",
    "refs": [
      "main 7eeeef0 (executed); PR 91 59913b8 and PR 93 d1c730c (static inspection only)"
    ],
    "location": "scripts/standalone.mjs:4; src/main.tsx:99",
    "requirements": [
      "G1",
      "G2",
      "L4",
      "K1"
    ],
    "root_cause_layer": "config",
    "red_test": "e2e/audit/standalone.start.spec.ts",
    "run_cmd": "npm run build && npx playwright test --config e2e/audit/playwright.standalone.config.ts",
    "depends_on": [],
    "size": "S",
    "fix_risk": "medium"
  },
  {
    "id": "AUD-017",
    "title": "Session imports replace current work without confirmation",
    "category": "Data",
    "severity": "Blocker",
    "blocker": true,
    "confidence": "confirmed",
    "verification": "VERIFIED",
    "refs": [
      "main 7eeeef0 (executed); PR 91 and PR 93 not independently tested"
    ],
    "location": "src/app/practice-launcher.tsx:56; src/App.tsx:551",
    "requirements": [
      "G7",
      "G8"
    ],
    "root_cause_layer": "UI",
    "red_test": "e2e/audit/import.requires-confirmation.spec.ts; e2e/audit/import.file-confirmation.spec.ts",
    "run_cmd": "npx playwright test e2e/audit/import.requires-confirmation.spec.ts e2e/audit/import.file-confirmation.spec.ts --project=mobile-390 --workers=1",
    "depends_on": [],
    "size": "M",
    "fix_risk": "medium"
  },
  {
    "id": "AUD-018",
    "title": "Unexpected mirror rejection aborts combined Cron result on main",
    "category": "Bug",
    "severity": "High",
    "blocker": false,
    "confidence": "confirmed",
    "verification": "VERIFIED",
    "refs": [
      "main 7eeeef0 (executed); PR 91 59913b8 (static); PR 93 d1c730c contains allSettled and its analogous test passed."
    ],
    "location": "worker/src/event-store.ts:269; worker/src/index.ts:239",
    "requirements": [
      "N6",
      "E2",
      "E3",
      "K3"
    ],
    "root_cause_layer": "cron",
    "red_test": "worker/test/audit/cron.isolates-mirror-failures.test.ts",
    "run_cmd": "npx vitest run --config worker/test/audit/vitest.audit.config.ts worker/test/audit/cron.isolates-mirror-failures.test.ts",
    "depends_on": [],
    "size": "M",
    "fix_risk": "medium"
  }
]
```
