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
