# Laptop, desktop and phone — final automated results

Aggregate gate: **AUTOMATED PASSED**, `2026-10-27T06:15:10.140Z` UTC. Production build and manual gate are recorded separately below.

| Layer | Passed | Failed / skipped |
|---|---:|---:|
| Vitest unit / DOM / integration / property / architecture | 282 | 0 / 0 |
| Playwright, seven actual Chromium viewport projects | 359 | 0 / 0 |
| TypeScript application, tests and config | passed | 0 |

The complete final run has **0 flaky cases and 0 automatic retries**. These numbers count executions, not unique requirements. 37 new unit/DOM/runtime cases extend the original 239; six more advanced-notation UI cases bring the current total to 282. Three property tests each execute 75 generated histories, not 225 separately reported cases.

## Browser projects

| Project | Executed | Passed | Failed |
|---|---:|---:|---:|
| mobile-320 | 57 | 57 | 0 |
| mobile-390 | 57 | 57 | 0 |
| mobile-430 | 57 | 57 | 0 |
| laptop-1024 | 47 | 47 | 0 |
| laptop-1440 | 47 | 47 | 0 |
| desktop-1920 | 47 | 47 | 0 |
| desktop-2560 | 47 | 47 | 0 |

The three phone projects retain all 171 earlier browser executions and their original nine visual baselines. Each wide project executes 27 behavior/accessibility cases, four visual states, nine shared axe states and seven shared persistence cases (47 executions). Wide viewports are 1024×768, 1440×900, 1920×1080 and 2560×1440; boundary resizing additionally exercises 899/900 and 1599/1600 CSS pixels.

## Observed implementation and checks

- Two columns at laptop widths; a question navigator is added for desktop batches. Single-question desktop stays two-column. The question and timer remain visible while long work scrolls, and the navigator has its own bounded scroll area. The initial empty notebook fits each target viewport.
- Fresh wide sessions keep the numeric keyboard closed. Explicit keyboard preference survives resizing. Math, active question, confidence, cursor and Undo/Redo use the shared Zustand engine across all layouts.
- The visual and DOM order agree: Undo/Redo and quick symbols precede wide steps; the phone retains its approved tool order. The extended existing notation catalog is available directly through More math tools and slash on wide screens, including variables, comparisons, calculus and matrices. Keyboard Home/End and arrows keep focused catalog entries visible.
- Question browsing retains drafts without pretending they have been submitted. Next/final review still requires explicit confidence. Question status and progress distinguish not-started, draft, answered and skipped states without grading the answer.
- Pointer placement between particular digits, forward deletion, field boundaries, Ctrl+Z, named reset/delete, first-step protection, empty new steps and retention of adjacent work pass in real browsers.
- Shortcut help, confidence and completion are labelled portal dialogs with tested focus trapping/restoration. JSON export, invalid import, copy fallback, migration, malformed storage, quota failure, two-tab sync and explicit draft conflict decisions run at all seven widths.
- Browser axe scans all nine shared states at each viewport, plus shortcut help on wide layouts. Contrast remains enabled; no browser rule exclusions are used. A detected visible-label/accessibility-name mismatch in question navigation was fixed with native button text, not a rule waiver.
- Sixteen new full-page screenshots cover single/batch/multi-step/help at four wide widths. All 25 phone/wide comparisons pass with automatic updates disabled. Only timer pixels are masked. Baselines were reviewed as engineering evidence, not user or screen-reader acceptance.
- A real cloud-browser session also opened the laptop view over HTTP, started a batch and inserted advanced notation without showing a numeric keyboard. Non-secure preview initialization now reuses the existing non-authentication ID generator instead of requiring randomUUID availability.

## Current measured production coverage

| Metric | Percent |
|---|---:|
| Lines | 88.91% |
| Statements | 80.76% |
| Functions | 85.25% |
| Branches | 77.04% |

V8 figures measure unit/DOM execution only; browser coverage is not merged into those percentages. Coverage and automated axe results do not certify usability or exhaustive correctness.

## Remaining human acceptance

All **18 manual checks remain pending**: 12 phone checks plus six wide checks. Actual Firefox/Safari rendering, real browser zoom, physical devices, NVDA speech and macOS VoiceOver editing have not been claimed as passed. `npm run test:manual-gate` remains blocked and `test:release` cannot approve release until evidence is supplied. Private review deployment does not change those results.

The required test procedures and scope are in [WIDE_TEST_PLAN.md](WIDE_TEST_PLAN.md) and [testing/manual-protocol.md](testing/manual-protocol.md). Source organization remains React/strict TS + Zustand/Immer, RHF/Zod, source-owned Radix/shadcn-style UI, semantic CSS/Tailwind, with pure workspace policies and responsive subscriptions separated from components.

## Evidence

- `test-results/gate.json`: real subprocess exit statuses.
- `test-results/vitest.json` and `coverage/coverage-summary.json`: detailed test and coverage records.
- `test-results/playwright.json` and browser attachments: executed cases, axe results and failures when present.
- `e2e/wide/workspace.spec.ts-snapshots/`: 16 new review baselines; phone baselines remain unchanged.
- `docs/images/wide-laptop-runtime.jpg`: unmasked screenshot from the running cloud-browser app.
- `docs/testing/manual-acceptance.json`: unchanged pending statuses plus the six new wide checks.

Earlier red iterations are superseded by this clean aggregate run. No tests were deleted or skipped to obtain a pass. Tablet-specific redesign and cloud synchronization remain outside scope.
