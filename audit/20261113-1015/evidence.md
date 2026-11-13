# Evidence index — run 20261113-1015

Local runs use synthetic data and mocked external services unless otherwise specified. No user data or credentials are included.

| Evidence | Executed result | Command or source |
|---|---|---|
| Main unit suite | 975 passed, 75 files | `npx vitest run` before adding deliberate audit tests |
| Main Worker suite | 113 passed, 6 files | `npm run test:worker` |
| PR 91 Worker | 115 passed, 6 files | `npx vitest run --config worker/vitest.config.ts` at 59913b8 |
| PR 92 Worker | 122 passed, 7 files | same command at f384ca4 |
| PR 93 | 980 unit passed, 75 files; 114 Worker passed, 6 files; typecheck exit 0 | exact head d1c730c; `npx vitest run`, Worker config, `npm run typecheck` |
| AUD-002 | 3 runs: first POST approx 4 ms, expected >= 5000 ms | `npx vitest run tests/audit/outbox.debounce.test.ts` |
| AUD-009 | 3 runs: two local Worker reset/release executions; old epoch event returned 200 and/or appeared in SQLite | `npx vitest run --config worker/test/audit/vitest.audit.config.ts worker/test/audit/reset.stale-event.two-full-resets.test.ts` |
| AUD-010 / 011 | 3 runs: fake unowned matching file selected for trash; synthetic Notion reference removed | `npx vitest run --config worker/test/audit/vitest.audit.config.ts worker/test/audit/reset.ownership-and-notion.test.ts` |
| AUD-013 | 3 runs: DO accepted 300 KB; public Worker returned 413 | `npx vitest run --config worker/test/audit/vitest.audit.config.ts worker/test/audit/state.proxy-limit.test.ts` |
| AUD-014 | 3 runs: queued synthetic event reached mock network with pending flag | `npx vitest run tests/audit/outbox.reset-pending.test.ts` |
| AUD-015 | 3 runs: mobile-320 menu item had zero decorative SVG icons | `npx playwright test e2e/audit/menu.import-icon.spec.ts --project=mobile-320 --workers=1` |
| Mobile 320 main UI / AXE | 9 UI tests and 9 AXE tests passed | `e2e/ui-audit-regressions.spec.ts` and `e2e/accessibility/axe-states.spec.ts` |
| Desktop main AXE / persistence | 9 AXE and 8 storage/conflict tests passed | laptop-1440 Playwright project |
| Google auth PR 93 | 3 browser tests passed using fake identity and fake Worker/Drive responses | `e2e/accessibility/drive-session-confirmation.spec.ts` and `e2e/persistence/google-auth-new-tab.spec.ts` |
| CI PR 91 / 92 / 93 | failed, see individual job logs | https://github.com/amirhoseinLotfii/math-scratchpad/actions/runs/43266173382 ; https://github.com/amirhoseinLotfii/math-scratchpad/actions/runs/43278685074 ; https://github.com/amirhoseinLotfii/math-scratchpad/actions/runs/43294569144 |
| Visual | PR 93 synthetic menu screenshot, inspected | https://drive.google.com/file/d/17yrKftfZ7Xt6g5-2B3btmKxu3mpV-vOf/view |
| Production dependency audit | 1 high advisory, exploitability not tested | `npm audit --omit=dev`; GHSA-mrhx-c7xc-m3w5 |
| Git history secret scan | 1 Google public browser key match in historical commit 85da3f64; actual restrictions unknown | gitleaks 8.30.1 `git --redact=100`; key not recorded |
| Audit output secret scan | 0 findings | gitleaks 8.30.1 `dir --redact=100` on audit and test paths |
| Lighthouse isolated local lab | mobile 88 / LCP 3.82s / TBT 68ms / CLS .032; desktop 100 / .76s / 0ms / .003 | Lighthouse 13.6.0, all HTTPS blocked, one run each; not field data |

| AUD-016 | Local standalone build showed undefined PROD; red browser test failed 3 times | `npm run build` then `npx playwright test --config e2e/audit/playwright.standalone.config.ts` |
| Backup and keyboard | synthetic full-backup mobile and desktop passed; 15 mobile keyboard adaptation tests passed | `e2e/persistence/learning-backup.spec.ts`, `e2e/accessibility/keyboard-and-adaptations.spec.ts` |
| AUD-017 | 3 mobile runs: valid JSON immediately replaced synthetic current expression; no separate confirmation | `npx playwright test e2e/audit/import.requires-confirmation.spec.ts --project=mobile-390 --workers=1` |
| S13 | 3 local mobile invalid/oversized/script-bearing malformed payloads showed error; no injected script execution | `npx playwright test e2e/audit/import.invalid-inputs.spec.ts --project=mobile-390 --workers=1` |
| S7 | 1 local Worker test passed: repeated one-event batch stores once, altered ID content rejected | `npx vitest run --config worker/vitest.config.ts -t 'stores one row for retries and rejects an ID reused with different content'` |
| PR 92 visual | Workspace selector visible only in actual; palette differs. Selector introduced after last baseline snapshot | https://drive.google.com/file/d/1MGBmxuM8vOclZ1MvdYNZc_6OQG0dWQV2/view ; https://drive.google.com/file/d/1SLmcjifTDSy4rRtLBjhlXM4iXcPCbVAG/view |
| AUD-018 | 3 local Worker tests: synthetic Drive rejection aborts combined route; PR93 existing counterpart passed | `npx vitest run --config worker/test/audit/vitest.audit.config.ts worker/test/audit/cron.isolates-mirror-failures.test.ts` |
| Auth negative control | fake downstream storage failure returned a 5xx, not 401 | `npx vitest run --config worker/test/audit/vitest.audit.config.ts worker/test/audit/auth.downstream-error.test.ts` |
