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
