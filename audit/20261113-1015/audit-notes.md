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
