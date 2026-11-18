# Test backlog

- `tests/integration/lesson-phase3.test.tsx` — `loads the question bank and starts phase 3` — intermittent lazy-loading/timing failure was not reproduced on clean worktrees; likely test/application scheduling sensitivity.
- `tests/integration/drive-bank-ui.test.tsx` — Drive-bank connection/loading cases — intermittent async UI timing failures were not reproduced on clean worktrees; likely fixture or lazy-load scheduling sensitivity.
- `e2e/mathlive-first-keystroke.spec.ts` — `new diagnostic question accepts the first physical keystroke immediately after onboarding` on `mobile-320` — the historical `7139` to `713` loss was not reproduced in 170 runs; retain as a watch item until a trace is reproducible.
- `e2e/persistence/local-storage-sync.spec.ts` — `SYNC-04: storage events do not bounce forever between clean tabs` — one `mobile-390` run observed revision `4` instead of `3` and five reruns passed; retain as a sync watch item pending the release-worktree 20-run check.
