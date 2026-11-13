# Audit notes

## Decisions
- Preserve production and protected data. No Google sign-in, destructive operations or production writes.
- Do not write to Google Drive until personal account identity is established.
- Partial report: no assumption that static findings were reproduced.

## Checkpoint
- Main and PR SHAs, CI logs, Worker deployment read; local 975 app and 113 Worker tests passed; main AXE mobile 9 passed.
- Remaining: full tier 1 behavioral checks, PR tests, browser scenarios, Drive/Notion counts, security, accessibility, full contract and evidence tests.

## Resume checkpoint — 2026-11-13
- AUD-009: synthetic local Worker release regression failed three times: fixed epoch reused. Distinct reset completion states were simulated; actual full resets and stale event writes were not performed.
- Main: mock offline mobile 1/1, desktop 2/2; synthetic lesson resume 2/2; keyboard placement isolated rerun 1/1. A concurrent run had a trace cleanup collision.
- PR 93 exact head: 56 targeted unit tests passed; UI-AUDIT-07 failed locally as in CI. Local font-path warning due to symlinked node_modules.
- Remaining: complete local reset/end-to-end event scenarios, real Chapter 1 synthetic-safe bank, PR 91/92 suites, production-safe checks, Notion and Drive count, broader security, performance and accessibility.

## Resume checkpoint — full Worker reset, local only
- AUD-009: executed two complete local Worker reset + release handlers, with external Drive disabled; old-generation synthetic event accepted and stored. Three tests ran: first failed on HTTP 200 instead of 426, two repeats failed on row count 1 instead of 0. No production writes.
- Main sample lesson persistence browser test passed on mobile 390, including answer entry and reload. This is not the real Chapter 1 bank.
- Next: inspect external integrations, project APIs, targeted tests and remaining accessibility/security items.

## Phases 3–4 / focused security checkpoint
- PR 91 Worker 115/115 and PR 92 Worker 122/122 passed locally at pinned heads. PR 93 targeted 56 passed as previously logged; not full suites.
- AUD-010 and AUD-011: ownership and Notion reference synthetic red tests each failed identically across three runs; no real Drive or Notion data touched.
- AUD-012: npm audit --omit=dev reports 1 high Zod advisory; actual exploitability not tested.
- Main connected lesson/a11y fixture tests 3/3 passed on mobile 390.
- Next: further contract, browser, auth, performance, CI and security review.

## Phases 5–7 checkpoint
- AUD-013: local public Worker returns 413 for 300 KB state while direct DO accepts it; reproduced three runs. PR 91 and PR 93 share this static limit.
- PR 93 keyboard test change occurred in b305a95; 776fd7fc changed only comment. Other auth test changes reviewed selectively; exhaustive quality review remains NOT_TESTED.
- Pairwise merge-tree had no textual conflicts, but semantic compatibility and integrated suites remain NOT_TESTED. PR 92 is based on PR 91.
- HEAD response inspection observed HSTS, no reported CSP/COOP on Pages; not a complete security review.

## Phase 8–9 checkpoint
- AUD-002 confirmed: three mock runtime tests observed ~4 ms until first POST. Test uses wall clock, so no claim about max-wait behavior.
- Main mobile 320 UI audit 9/9, desktop storage/conflict 8/8; PR 93 Worker 114/114 and typecheck pass.
- Production Pages browser navigation failed twice with ERR_EMPTY_RESPONSE; no writes were attempted, so S18 BLOCKED. HEAD requests succeeded earlier.
- Notion count-only: Math Attempts 5, Mistakes 0, Concepts 0, Daily Reports 0. Shared Sessions not counted; ownership not inferred.
- Combined audit tests 6 red assertions across 5 test files; these red tests are deliberate findings, not a passing suite.

## Phase 9 additional checkpoint
- AUD-014: main sync runtime transmitted seeded synthetic outbox event to fake network despite reset-pending flag, reproduced three times. Server behavior and actual owner phone path untested. PR 93 includes guard, not independently proven by this test.
- Main dist assets total 7.2 MB including fonts/maps; primary JS 1,622,724 raw bytes, 471,350 gzip bytes (local build). Lighthouse pending.

## Phase 10 performance, security and visual checkpoint
- Lighthouse isolated loopback, all HTTPS blocked: mobile 88, LCP 3.82s, TBT 68ms, CLS .032; desktop 100, LCP .76s, TBT 0ms, CLS .003. Single lab runs, not field data.
- Gitleaks 8.30.1 reachable history: 1 browser Google key match at historical commit; code describes public key restriction, Cloud Console settings unverified. Audit output and audit tests scan: 0 findings.
- AUD-015: missing Import session JSON icon reproduced 3 mobile runs and visually inspected synthetic PR 93 screenshot saved to Drive.
- PR91 CI failed on invalid JSON setup after Enter; PR93 CI failed a similar interaction. Local extra diagnostic: explicit focus+keyboard Enter succeeded once; direct locator press yielded both failure and success in separate runs. No root cause established.
- Desktop axe 9/9 and source/test typecheck pass.

## Additional coverage checkpoint
- PR 93 full app Vitest: 75 files, 980 passed at d1c730c; Worker 114 and typecheck previously passed. Three mocked Google/Drive browser tests passed, with local font serving warnings caused by symlinked dependencies.
- Self-check corrected summary table placement and rebuilt per-code statuses; no claim that untested scenarios passed.
- Complete broad E2E gate is not run from audit branch because deliberate red tests are included by default; unvetted test traffic must also be isolated from production first.

## Additional offline and recovery coverage
- AUD-016: generated standalone HTML fails on startup because `.env.PROD` is undefined in IIFE output; local browser with external network blocked saw alert and no editor. Red test failed three times. First configuration attempt served wrong directory and was corrected; not counted as product failure.
- Synthetic full-backup fixture passed mobile and desktop, desktop earlier target crash under concurrent load and subsequent rerun passed; no claim of root cause.
- Mobile keyboard adaptation suite 15/15 passed.
- K1 static: main ID token request timeout 30 seconds; actual cause and PR 93 fix on owner's account remain untested.

## Import validation checkpoint
- AUD-017: three local mobile runs replaced a synthetic existing expression with a valid imported session immediately, without a separate confirmation. No real data, no external requests. The red test expects old work to persist until confirmation.
- S13: three local mobile browser tests passed for malformed JSON, 1,000,001-character oversized input, and one script-bearing malformed object; error visible, no injected script execution. Scope is limited to those inputs and device.

## CI visual and isolated layout checkpoint
- PR 92 CI screenshot expected/actual inspected. Actual shows Workspace selector and different palette; selector git-blamed to 9a14772, after baseline snapshot c05bcf4. Theme tokens also changed in later ancestor 4ea691c. PR92 delta from PR91 touches no frontend or visual baseline. Remaining pixel causes not established. Synthetic expected and actual screenshots backed up to Drive.
- Isolated initial layout 3/3 passed (320, Pixel 7, desktop): no pageerror or horizontal overflow before menu; menu opened. Full S1 still incomplete.
- S7 one-event retry local Worker test passed, including changed-content rejection; 112 tests were intentionally filtered in targeted run. S9 failed by AUD-009.

## Cron and exception handling checkpoint
- AUD-018: three isolated main Worker tests injected a Drive rejection; combined sync route rejected instead of returning both results. Notion task cancellation was not demonstrated. PR93 existing analogous test passed in 114-test Worker suite; actual production Cron failure still unknown.
- A narrow fake Worker storage exception returned 5xx rather than 401; suspected auth error masking was not reproduced.

## Resume after environment replacement
- Recreated local checkout from audit branch and reinstalled locked dependencies. Restored RUN_ID, branch and finding IDs from stored progress; no production data writes.
- AUD-005: synthetic local POST scoped execute returned 404 in three previous attempts and one after environment restoration. PR92 still only statically examined.
- AUD-017: Import backup file path independently replaced synthetic current work without separate confirmation in three local mobile runs; unified with prior text-import finding.
- S10: PR91 local Worker test covered orphaned lock takeover and release; real production lock not altered.

## Phase 9 — keyboard and import diagnostic checkpoint
- Timestamp: 2026-11-13T12:19+03:30.
- Import from a valid synthetic backup file replaced a synthetic active expression without showing confirmation in 3/3 mobile runs. No user data or external service was used; AUD-017 now covers both JSON and file import paths.
- Menu keyboard subset: initial one-shot 10/10 Enter/Space/Escape checks passed across Pixel 7 emulation (320×640) and desktop. Repeated mobile Enter test then reproduced intermittent loss: 4/5 attempts focused and blurred the Import session JSON item before key delivery, with no keydown/click and menu root active; desktop 5/5 passed. Direct locator press failed 2/3 mobile repeats and passed 3/3 desktop. Escape closed and restored trigger focus in 2/2 devices.
- Hypotheses by likelihood: (1) compact-menu focus/roving-focus interaction around inline Data role=group at src/app/exercise-menu.tsx:123–130; (2) touch emulation plus pointer hover in this test path; (3) asynchronous compact-layout initialization. Exact root cause remains unisolated after repeated attempts; no app code changed.
- Updated AUD-007, K5, N8, I2, I3, I4, G7, G8, S12 and menu test matrix. Full menu matrix, all other S12 actions, S14/S15, and live production browser remain NOT_TESTED/BLOCKED.
- Evidence added to evidence.md; typecheck passed. Secret scan of audit/<RUN_ID>, tests/audit, worker/test/audit and e2e/audit returned zero findings. A repository-root scan separately found the previously documented browser API key at src/features/drive-bank/drive-config.ts:4; it is not copied into audit files or the report.
