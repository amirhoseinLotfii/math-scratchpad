# Phone implementation and verification results

Final automated gate: **PASSED**. Recorded at `2026-10-27T03:20:53.236Z` (UTC).

- Vitest: **239 passed, 0 failed, 0 skipped**, across 23 files.
- Playwright: **171 passed, 0 failed, 0 skipped, 0 flaky**. 57 definitions × widths 320, 390 and 430; Chromium 153 on Linux with mobile emulation. All nine full-page screenshot comparisons passed with `updateSnapshots: none`; no ignored snapshots or automatic retries in this gate.
- TypeScript: application, test and config checks passed.
- Browser axe: all nine states at each width passed without disabled rules, including contrast. This is automated evidence, not a WCAG conformance certificate.
- Manual acceptance: **BLOCKED / 12 checks pending**, deliberately unchanged; no physical Android, TalkBack or user approval is asserted.

## Implemented behavior

Production now uses React/strict TypeScript, Zustand with Immer, source-owned Radix-backed shadcn-style primitives, RHF/Zod forms, Tailwind/semantic tokens, and versioned validated localStorage persistence. Redux runtime dependencies are removed. The first step is protected; reset/delete, insertion gaps, Undo/Redo, slash chooser, numeric cursor boundaries, quick symbols, approved keypad order, per-question timers, confidence/completion dialogs, batch navigation, complete JSON export and clipboard recovery are exercised by the tests.

Storage tests exercise actual production persistence: debounce, versioned hydration, legacy migration without backup deletion, invalid/future draft preservation, clean-tab sync, explicit local/remote conflict resolution, no timer echo, disposal and quota recovery. Browser conflict tests freeze the local clock and derive the incoming revision from the current saved draft; UUID strings are not mistaken for typed numbers.

Menu activation waits for click completion before making the background inert. A 15-run touch-menu regression passed across the three widths. Tab focus on a math insertion gap now updates the actual cursor before typing.

## Executed Vitest files

| File | Executed | Passed | Failed |
|---|---:|---:|---:|
| tests/app.test.tsx | 13 | 13 | 0 |
| tests/assessment.test.ts | 13 | 13 | 0 |
| tests/fraction-round.test.tsx | 6 | 6 | 0 |
| tests/keyboard-ux.test.tsx | 13 | 13 | 0 |
| tests/legacy.test.ts | 4 | 4 | 0 |
| tests/store.test.ts | 18 | 18 | 0 |
| tests/accessibility/dialogs.test.tsx | 11 | 11 | 0 |
| tests/accessibility/forms-and-menus.test.tsx | 11 | 11 | 0 |
| tests/accessibility/semantics.test.tsx | 13 | 13 | 0 |
| tests/architecture/target-stack.test.ts | 5 | 5 | 0 |
| tests/integration/mobile-clipboard.test.ts | 4 | 4 | 0 |
| tests/integration/mobile-confidence.test.tsx | 9 | 9 | 0 |
| tests/integration/mobile-controls.test.tsx | 16 | 16 | 0 |
| tests/integration/mobile-flow.test.tsx | 7 | 7 | 0 |
| tests/integration/mobile-timer.test.tsx | 8 | 8 | 0 |
| tests/properties/editing-invariants.test.ts | 3 | 3 | 0 |
| tests/unit/acceptance-gate.test.ts | 12 | 12 | 0 |
| tests/unit/gate-runner.test.ts | 4 | 4 | 0 |
| tests/unit/mobile-boundaries.test.ts | 30 | 30 | 0 |
| tests/unit/mobile-session.test.ts | 4 | 4 | 0 |
| tests/unit/persistent-runtime.test.ts | 10 | 10 | 0 |
| tests/unit/session-validation-contract.test.ts | 13 | 13 | 0 |
| tests/ux/local-storage-recovery.test.ts | 12 | 12 | 0 |

## Measured DOM/unit production coverage

| Metric | Percent |
|---|---:|
| Lines | 87.11% |
| Statements | 78.77% |
| Functions | 83.68% |
| Branches | 74.36% |

Browser execution is not included in this V8 coverage measurement. Three property tests each run 75 generated histories; the 225 trials are not added to the test-case total. JSDOM axe cannot measure rendered contrast or canvas text; both rules stay enabled in the browser suite.

## Evidence and limits

- `test-results/gate.json`: actual exit codes for types, coverage tests and browser suite.
- `test-results/vitest.json`, `coverage/coverage-summary.json`: detailed results and measured coverage.
- `test-results/playwright.json`, `test-results/browser-artifacts/`: browser results and attached axe reports.
- `e2e/visual/mobile-layout.spec.ts-snapshots/`: nine engineering-reviewed real browser baselines, with only the changing timer masked.
- `docs/testing/manual-acceptance.json`: evidence-bearing human/device gate, still pending.

Earlier failing development runs are superseded by this clean full gate. No tests were skipped to obtain a pass. Desktop/tablet redesigns, cross-device cloud sync and publishing remain outside this phone implementation. Short screens scroll vertically to preserve readable text and touch targets; physical keyboard/viewport interaction, safe areas, clipboard permissions, TalkBack speech, incomplete axe findings and final visual approval still require the documented manual protocol. Existing root App/assessment files remain; feature-folder migration is partial and documented.

Run `npm ci`, `npm run test:browser:prepare`, then `npm run test:gate`. `npm run test:release` additionally requires genuine manual evidence and must remain blocked until supplied.
