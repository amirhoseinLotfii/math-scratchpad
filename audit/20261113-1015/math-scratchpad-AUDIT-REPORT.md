# Math Scratchpad — Full Audit Report
RUN_ID 20261113-1015 · 2026-11-13 Asia/Tehran · status: PARTIAL · auditor: Codex

## 0. TL;DR
3 Blocker, 1 Critical, 8 High, 1 Medium; 0 Low. Findings include static risks, not all reproduced.
Can learning safely start today? **Undetermined; do not assume safe cross-device persistence.** A reset-pending browser can be locked, exit-flush is absent in main, and distinct reset releases reuse the same epoch; an old-generation event was accepted after two complete local Worker resets (Drive disabled). No safe phone-only recovery was verified.
Next: verify reset state and auth on synthetic environment; repair and test outbox; resolve both CI failures and release drift.

## 1. Environment & coverage
Repository cloned. Node 24.22.1, npm 11.9.0. npm ci --ignore-scripts succeeded; local tests ran. Cloudflare read access succeeded. Google Drive personal identity verified and audit backup created. Read-only Notion aggregate counts were queried for four project-designated sources; shared Sessions was deliberately not counted without a reliable project marker. Real sign-in and protected production data were not touched.
PARTIAL: Phases 0–2 incomplete; focused portions of phases 3–7 and 9–10 performed; phase 8 and most scenarios not completed. Static review does not count as a behavioral test. No claim of exhaustive coverage.

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
| main | Build | VERIFIED | exit 0, Worker dry run | npm run build; standalone build warned import.meta is empty in IIFE; effect NOT_TESTED |
| PR 93 | CI gate | FAILED | 90 passed, 1 failed, 515 did not run | [run](https://github.com/amirhoseinLotfii/math-scratchpad/actions/runs/43294569144), AUD-007 |
| PR 92 | CI gate | FAILED | 93 passed, 1 failed, 512 did not run | [run](https://github.com/amirhoseinLotfii/math-scratchpad/actions/runs/43278685074), AUD-008 |
| PR 91 | Worker tests | VERIFIED | 6 files, 115 passed | local, exact head 59913b8 |
| PR 92 | Worker tests | VERIFIED | 7 files, 122 passed | local, exact head f384ca4 |
| main | Outbox 5-second debounce | FAILED | three runs sent after roughly 4 ms | tests/audit/outbox.debounce.test.ts; AUD-002 |
| main | UI audit mobile-320 | VERIFIED | 9 passed | e2e/ui-audit-regressions.spec.ts |
| main | Local storage / conflict desktop | VERIFIED | 8 passed | local-storage-sync and server-conflict-resolution |
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
- AUD-001: Reset-pending state makes editor inert until authenticated cloud check. Phone workaround: none verified; do not clear storage, reset, or sync as an ad-hoc remedy.
- AUD-003: Exit and hidden-page flush are absent from main. Phone workaround: none verified; do not clear storage, reset, or sync as an ad-hoc remedy.

- AUD-009: Distinct reset releases reuse the same epoch. Phone workaround: none verified; avoid any additional reset while this is investigated.

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
- **Confidence:** likely · **Verification:** NOT_TESTED
- **Refs affected:** main 7eeeef0; PR 92 f384ca4
- **Location:** worker/src/index.ts:219; PR 92 worker/src/index.ts:231
- **Related:** N3 C9 K6
- **Evidence:** Both inspected route lists expose GET /reset/preview but no /reset/execute. PR 92 scoped-reset-plan.ts:38–45 explicitly describes a future transactional planner. No production write or endpoint probing was performed.
- **Reproduction:** Inspect the referenced source and run the acceptance test below. Red test: n/a (not created in this partial run).
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

### AUD-007 — PR 93 CI gate fails on mobile session backup workflow
- **Category:** CI/test
- **Severity:** High · **Blocks learning today:** no
- **Confidence:** confirmed · **Verification:** VERIFIED
- **Refs affected:** PR 93 d1c730c
- **Location:** e2e/ui-audit-regressions.spec.ts:103
- **Related:** I2 L3 L4
- **Evidence:** Run 43294569144 mobile-320 UI-AUDIT-07 failed and failed on retry: Session backup region not found after Enter; 90 passed and 515 did not run. Root cause is unresolved: keyboard interaction, focus, or test setup are possibilities.
- **Reproduction:** Inspect the referenced source and run the acceptance test below. Red test: n/a (not created in this partial run).
- **Expected / Actual:** Contract and acceptance behavior below / evidence above.
- **Root cause:** layer CI; e2e/ui-audit-regressions.spec.ts:103; mechanism or unresolved cause as stated in evidence.
- **Proposed fix (not executed):** Reproduce locally against exact PR head, inspect focus/DOM and fix the actual failure without weakening the assertion.
- **Fix acceptance:** Run UI-AUDIT-07 three times on PR head and verify Enter/Space and mouse.
- **Size:** M · **Fix risk:** medium

### AUD-008 — PR 92 mobile-320 visual CI gate fails
- **Category:** CI/test
- **Severity:** High · **Blocks learning today:** no
- **Confidence:** confirmed · **Verification:** VERIFIED
- **Refs affected:** PR 92 f384ca4
- **Location:** e2e/visual/mobile-layout.spec.ts:23
- **Related:** H1 L3
- **Evidence:** Run 43278685074 failed single-edit snapshot and its retry: 27,690 pixels differed (11%) against 3% tolerance; 93 passed, 512 did not run. Actual visual cause not established.
- **Reproduction:** Inspect the referenced source and run the acceptance test below. Red test: n/a (not created in this partial run).
- **Expected / Actual:** Contract and acceptance behavior below / evidence above.
- **Root cause:** layer CI; e2e/visual/mobile-layout.spec.ts:23; mechanism or unresolved cause as stated in evidence.
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

## 6. Findings summary table
| ID | Title | Category | Severity | Confidence | Verification | Location |
|---|---|---|---|---|---|---|
| AUD-001 | Reset-pending state makes editor inert until authenticated cloud check | Bug | Blocker | likely | NOT_TESTED | src/sync/server-connection-gate.tsx:135; src/main.tsx:42 |
| AUD-002 | Outbox initiates sync immediately instead of five-second trailing debounce | Contract violation | High | confirmed | VERIFIED | src/sync/runtime.ts:285 |
| AUD-003 | Exit and hidden-page flush are absent from main | Contract violation | Blocker | likely | NOT_TESTED | src/sync/runtime.ts:102; src/sync/runtime.ts:292 |
| AUD-004 | Production Worker and Pages originate from different commits | Release | High | confirmed | VERIFIED | Worker deployment d376eafb-f0ab-42b9-8409-aab8f9bbaead; .github/workflows/pages.yml |
| AUD-005 | Scoped reset execution is not implemented | Missing | High | likely | NOT_TESTED | worker/src/index.ts:219; PR 92 worker/src/index.ts:231 |
| AUD-006 | PR 93 replaced Enter with pointer click in AXE setup | CI/test | Medium | confirmed | VERIFIED | e2e/accessibility/axe-states.spec.ts:20 |
| AUD-007 | PR 93 CI gate fails on mobile session backup workflow | CI/test | High | confirmed | VERIFIED | e2e/ui-audit-regressions.spec.ts:103 |
| AUD-008 | PR 92 mobile-320 visual CI gate fails | CI/test | High | confirmed | VERIFIED | e2e/visual/mobile-layout.spec.ts:23 |

| AUD-009 | Distinct reset releases reuse a static epoch | Data | Blocker | confirmed | VERIFIED | worker/src/event-store.ts:419 |

| AUD-010 | Reset selects Drive files by name without an ownership marker | Data | Critical | confirmed | VERIFIED | worker/src/event-store.ts:485 |
| AUD-011 | Reset clears Notion page references without external reconciliation | Data | High | confirmed | VERIFIED | worker/src/event-store.ts:532 |
| AUD-012 | Production dependency audit reports high-severity Zod advisory | Security | High | confirmed | VERIFIED | package.json |

| AUD-013 | Public Worker rejects state payloads accepted by the Durable Object | Contract violation | High | confirmed | VERIFIED | worker/src/index.ts:130 |

## Notion read-only aggregate observations
On 2026-11-13, aggregate counts from configured sources: Math Attempts 5; Mistakes 0; Concepts 0; Daily Reports 0. These are entire data-source counts, not proof of project ownership, deletion eligibility, or the age/type of the rows. Sessions is a shared core database; it was not counted because that could include protected Pomodoro records and no validated filter was established. No row contents were read or changed. See AUD-011.

## 7. Known issues K1–K8
- K1: NOT_TESTED — root cause / actual production behavior not established; see AUD-001.
- K2: NOT_TESTED — root cause / actual production behavior not established; requires dedicated tests and live-safe evidence.
- K3: NOT_TESTED — root cause / actual production behavior not established; requires dedicated tests and live-safe evidence.
- K4: NOT_TESTED — ownership and shared Sessions remain unresolved; aggregate Math Attempts count is 5, local reference deletion is confirmed in AUD-011, filename-only Drive selection in AUD-010.
- K5: NOT_TESTED — root cause / actual production behavior not established; see AUD-006 and AUD-007.
- K6: NOT_TESTED — root cause / actual production behavior not established; see AUD-005.
- K7: NOT_TESTED — root cause / actual production behavior not established; see AUD-004.
- K8: NOT_TESTED — root cause / actual production behavior not established; see AUD-002 and AUD-003.

## 8. Contract & requirements

### Route map (main, static only)
| Method | Public path | Authentication | Contract notes |
|---|---|---|---|
| GET | /health | none | returns service/ok; no SHA |
| POST | /session | Google ID | issues Worker session |
| POST | /session/revoke | owner | revokes session |
| POST | /admin/learning-reset; /admin/learning-reset/release | admin secret | bounded 4096-byte request; production not called |
| POST | /events; /state | owner | epoch header; public proxy body limit 250000 bytes, AUD-013 |
| GET | /state; /sync; /snapshot; /reset/preview | owner | query forwarded to Durable Object |
| GET/POST | /drive/status, /drive/sync; /notion/status, /notion/sync | owner | mirror operations |
| POST/GET | /bank/source; /bank/meta; /bank/content | owner | protected source; no live read |
| POST | /reset/execute | absent | AUD-005 |

Full request/response/error contract and duplicate type comparison: NOT_TESTED.

- N1: FAILED — debounce behavior failed in three mocked local runs (AUD-002); exit flush static gap AUD-003; full browser/real Worker validation remains incomplete.
- N2: FAILED — synthetic release epoch test failed; complete reset behavior NOT_TESTED; see AUD-009 and recovery risk AUD-001.
- N3: NOT_TESTED — full behavioral coverage incomplete; missing execution AUD-005.
- N4: FAILED — local fake Drive test selected unmarked file, AUD-010; Notion cleanup/reconciliation gap AUD-011.
- N5: NOT_TESTED — full behavioral coverage incomplete; requires dedicated validation.
- N6: NOT_TESTED — full behavioral coverage incomplete; requires dedicated validation.
- N7: NOT_TESTED — full behavioral coverage incomplete; release mismatch AUD-004.
- N8: NOT_TESTED — full behavioral coverage incomplete; keyboard coverage gap AUD-006 and CI AUD-007.

## 9. Review checklist
All entries below are NOT_TESTED in full; static observations are linked where available.
- A: A1 NOT_TESTED, A2 NOT_TESTED, A3 NOT_TESTED, A4 NOT_TESTED, A5 NOT_TESTED, A6 NOT_TESTED, A7 NOT_TESTED, A8 NOT_TESTED, A9 NOT_TESTED.
- B: B1 NOT_TESTED, B2 NOT_TESTED, B3 NOT_TESTED, B4 NOT_TESTED, B5 NOT_TESTED, B6 NOT_TESTED, B7 NOT_TESTED, B8 NOT_TESTED, B9 NOT_TESTED, B10 NOT_TESTED, B11 NOT_TESTED, B12 NOT_TESTED, B13 NOT_TESTED, B14 NOT_TESTED.
- C: C1 NOT_TESTED, C2 NOT_TESTED, C3 NOT_TESTED, C4 NOT_TESTED, C5 NOT_TESTED, C6 NOT_TESTED, C7 NOT_TESTED, C8 NOT_TESTED, C9 NOT_TESTED, C10 NOT_TESTED.
- D: D1 NOT_TESTED, D2 NOT_TESTED, D3 NOT_TESTED, D4 NOT_TESTED, D5 NOT_TESTED, D6 NOT_TESTED, D7 NOT_TESTED, D8 NOT_TESTED, D9 NOT_TESTED, D10 NOT_TESTED, D11 NOT_TESTED.
- E: E1 NOT_TESTED, E2 NOT_TESTED, E3 NOT_TESTED, E4 NOT_TESTED, E5 NOT_TESTED, E6 NOT_TESTED, E7 NOT_TESTED, E8 NOT_TESTED, E9 NOT_TESTED, E10 NOT_TESTED, E11 NOT_TESTED.
- F: F1 NOT_TESTED, F2 NOT_TESTED, F3 NOT_TESTED, F4 NOT_TESTED, F5 NOT_TESTED, F6 NOT_TESTED, F7 NOT_TESTED, F8 NOT_TESTED, F9 NOT_TESTED.
- G: G1 NOT_TESTED, G2 NOT_TESTED, G3 NOT_TESTED, G4 NOT_TESTED, G5 NOT_TESTED, G6 NOT_TESTED, G7 NOT_TESTED, G8 NOT_TESTED, G9 NOT_TESTED, G10 NOT_TESTED.
- H: H1 NOT_TESTED, H2 NOT_TESTED, H3 NOT_TESTED, H4 NOT_TESTED, H5 NOT_TESTED, H6 NOT_TESTED, H7 NOT_TESTED, H8 NOT_TESTED.
- I: I1 NOT_TESTED, I2 NOT_TESTED, I3 NOT_TESTED, I4 NOT_TESTED, I5 NOT_TESTED, I6 NOT_TESTED, I7 NOT_TESTED, I8 NOT_TESTED.
- J: J1 NOT_TESTED, J2 NOT_TESTED, J3 NOT_TESTED, J4 NOT_TESTED, J5 NOT_TESTED, J6 NOT_TESTED, J7 NOT_TESTED.
- K: K1 NOT_TESTED, K2 NOT_TESTED, K3 NOT_TESTED, K4 NOT_TESTED.
- L: L1 NOT_TESTED, L2 NOT_TESTED, L3 NOT_TESTED, L4 NOT_TESTED, L5 NOT_TESTED, L6 NOT_TESTED, L7 NOT_TESTED, L8 NOT_TESTED.

## 10. Browser scenarios
- S1: NOT_TESTED — complete specified scenario not executed; fixture and mock subsets are in section 3.
- S2: NOT_TESTED — complete specified scenario not executed; fixture and mock subsets are in section 3.
- S3: NOT_TESTED — complete specified scenario not executed; fixture and mock subsets are in section 3.
- S4: NOT_TESTED — complete specified scenario not executed; fixture and mock subsets are in section 3.
- S5: NOT_TESTED — complete specified scenario not executed; fixture and mock subsets are in section 3.
- S6: NOT_TESTED — complete specified scenario not executed; fixture and mock subsets are in section 3.
- S7: NOT_TESTED — complete specified scenario not executed; fixture and mock subsets are in section 3.
- S8: NOT_TESTED — complete specified scenario not executed; fixture and mock subsets are in section 3.
- S9: NOT_TESTED — complete specified scenario not executed; fixture and mock subsets are in section 3.
- S10: NOT_TESTED — complete specified scenario not executed; fixture and mock subsets are in section 3.
- S11: NOT_TESTED — complete specified scenario not executed; fixture and mock subsets are in section 3.
- S12: NOT_TESTED — complete specified scenario not executed; fixture and mock subsets are in section 3.
- S13: NOT_TESTED — complete specified scenario not executed; fixture and mock subsets are in section 3.
- S14: NOT_TESTED — complete specified scenario not executed; fixture and mock subsets are in section 3.
- S15: NOT_TESTED — complete specified scenario not executed; fixture and mock subsets are in section 3.
- S16: NOT_TESTED — complete specified scenario not executed; fixture and mock subsets are in section 3.
- S17: NOT_TESTED — complete specified scenario not executed; fixture and mock subsets are in section 3.
- S18: BLOCKED — production page navigation failed twice with ERR_EMPTY_RESPONSE; only read-only HEAD available. The separate nine AXE tests do not establish these scenarios.
- Real Google sign-in: BLOCKED — owner-only; no account sign-in was attempted.

### Test matrix coverage
Each complete row below is NOT_TESTED unless otherwise stated; partial results do not prove the whole row.
- Learning flow: NOT_TESTED — sample fixture passed; actual Chapter 1 and cross-device path remain untested.
- Outbox/event queue: FAILED — debounce AUD-002; offline reconnect mock passed; remaining assertions incomplete.
- Exit flush: NOT_TESTED — static absence on main AUD-003.
- Full reset, lock, epoch: FAILED — local reset/old event AUD-009; phone and external services untested.
- Google sign-in/Drive: NOT_TESTED — mocked PR 93 units only; real sign-in owner-only.
- Worker routes: FAILED — state limit AUD-013; complete contract incomplete.
- Cron: NOT_TESTED — current production failure cause/subrequest count unknown.
- Drive/Notion adapters: FAILED — synthetic reset ownership and references AUD-010/011; live effects not touched.
- Scoped reset: NOT_TESTED — no execute route statically (AUD-005).
- Multi-device: NOT_TESTED — desktop local-storage conflict tests pass, full convergence untested.
- Session, backup, import: NOT_TESTED — partial menu and local storage tests only.
- Menu and accessibility: NOT_TESTED — selected AXE/mobile checks passed, all items/keyboard coverage incomplete.
- Theme and layout: NOT_TESTED — partial 320/mobile tests passed; full visual matrix absent.
- Offline/network errors: NOT_TESTED — mocked reconnect passed, chaos matrix incomplete.
- Release: FAILED — deployment SHA mismatch AUD-004.
- Performance/security: FAILED — high npm advisory AUD-012; Lighthouse/gitleaks/exploitability not tested.

## 11. PR analysis & merge order
PR 92 is stacked on PR 91. Pairwise git merge-tree for 91/93, 92/93, 91/92 returned exit 0, but semantic compatibility was not tested. Consider 91 before 92 after testing, resolve PR 93 independently, then integrate and test one SHA. This is a proposed sequence, not merge authorization.

## 12. Proposed fix plan
1. Repair the confirmed old-generation replay risk and verify two-device behavior; reproduce lock, sign-in and exit scenarios and establish safe recovery. 2. Resolve confirmed CI failures and restore keyboard checks. 3. Integrate scoped reset only after data isolation tests. 4. Align release SHA, rerun full browser, worker, security and release gates.

## 13. Owner-only actions & open items
No safe user action has been verified to remove the pending lock. Do not start by clearing app storage or triggering reset. Google Cloud checklist when appropriate: verify authorized Pages/localhost JavaScript origins, OAuth consent publishing state and test users, required Drive scopes, and Pages COOP behavior. Do not share credentials.

## 14. Appendix
Audit branch: audit/full-20261113-1015. Evidence sources: source at pinned SHAs, current GitHub job logs linked above, local command outputs summarized in section 3. Red tests: worker/test/audit/reset.epoch.second-release.test.ts, reset.stale-event.second-release.test.ts and reset.stale-event.two-full-resets.test.ts (run command in AUD-009). Screenshots for delivery, production user-data verification and full security review: NOT_TESTED. `npm audit` found one high advisory (AUD-012). HEAD requests to Pages and Worker observed HSTS on Pages and did not expose CSP/COOP in the returned headers; security impact and all response paths were NOT_TESTED. No secrets or raw traces included.

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
    "confidence": "likely",
    "verification": "NOT_TESTED",
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
    "red_test": "",
    "run_cmd": "",
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
    "title": "PR 93 CI gate fails on mobile session backup workflow",
    "category": "CI/test",
    "severity": "High",
    "blocker": false,
    "confidence": "confirmed",
    "verification": "VERIFIED",
    "refs": [
      "PR 93 d1c730c"
    ],
    "location": "e2e/ui-audit-regressions.spec.ts:103",
    "requirements": [
      "I2",
      "L3",
      "L4"
    ],
    "root_cause_layer": "CI",
    "red_test": "",
    "run_cmd": "",
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
      "main 7eeeef0",
      "PR 91 59913b8 static",
      "PR 93 d1c730c static"
    ],
    "location": "worker/src/event-store.ts:419",
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
      "main 7eeeef0"
    ],
    "location": "worker/src/event-store.ts:485",
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
      "main 7eeeef0"
    ],
    "location": "worker/src/event-store.ts:532",
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
    "location": "package.json",
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
      "main 7eeeef0",
      "PR 91 and PR 93 static"
    ],
    "location": "worker/src/index.ts:130",
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
  }
]
```
