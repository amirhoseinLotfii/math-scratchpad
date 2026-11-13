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
