# Math Scratchpad — UI/UX Event-State Audit and Regression Fixes

Date: 2026-11-05  
Baseline: `main` at `f849cea5c0c53564e502e3f0c20cf893347517c4`  
Target branch: `fix/ui-audit-live-regressions-20261105`  
Production site: https://amirhoseinlotfii.github.io/math-scratchpad/

## Confirmed defects addressed

| ID | Severity | Reproduction | Cause | Fix | Evidence |
| --- | --- | --- | --- | --- | --- |
| UI-AUDIT-001 | P1 | On unsynced live site, open Exercise menu, click New Problem or Drive bank | `ServerConnectionGate` fixed top-right panel at z-index 10000; Google iframe intercepts pointer events over menu z-index 60 | Move authentication/status into normal flow **after** editor; keep login button functional and prevent overlay over notebook | Local production-mode 320/390/430/768/1024/1440 pointer hit tests; Playwright regression |
| UI-AUDIT-002 | P1 | Create new LaTeX problem or navigate 30-question diagnostics; rendered math stays at prior question | Read-only MathLive custom element shadow DOM is not refreshed by React text-content update | Give MathLive read-only element a key based on tag and LaTeX, forcing remount on changed expression | Source vs shadow reproduction; local 320/390/430/768/1024/1440 visual content verified |
| UI-AUDIT-003 | P2 | Open Insert Math Element and press Escape | Delayed Radix close focus restoration leaves BODY briefly focused | Restore focus to still-connected opener in onCloseAutoFocus, retain existing MathLive retry/fallback | Mobile and desktop Playwright Escape + Cancel tests |
| UI-AUDIT-004 | P2 | Open Privacy Policy and Terms at 320px | Email address exceeds viewport; unbreakable anchor | Add overflow-wrap/word-break fallback to long links | Playwright both pages at 320 and 390 |

| UI-AUDIT-005 | P3 | Open Import session JSON, then Start diagnostic or New Problem | Independent inline panel booleans leave multiple setup cards stacked | Make inline workflows mutually exclusive; preserve form state until explicit submit/cancel | UI-AUDIT-07, 3 mobile browser cases |

## Event-state matrix

The following cases ran against a disposable local build, not against personal Google/Notion accounts.

| Feature | Events / alternate paths | Screen coverage | Result |
| --- | --- | --- | --- |
| Offline sync gateway | initial blocked state, menu open, pointer center hit-test, button click, Google link presence | 320, 390, 430, 768, 1024, 1440; desktops up to 2560 through CI project | PASS |
| Original math problem | change LaTeX after first render, read source text and MathLive shadow DOM | 320, 390, 430; manual additional 768, 1024, 1440 | PASS |
| Insert math dialog | click, Escape, Cancel, immediate/settled focus restoration, open/close repeatedly | 320, 390, 430, 1024, 1440, 1920, 2560 | PASS |
| Step edit | Add Step, mark final, resize through 6 aspect ratios, delete step | 320×568, 390×844, 430×932, 768×1024, 1024×768, 1440×900 | PASS |
| Legal pages | navigation, responsive wrap, headings, link overflow | 320×568, 390×844 × both pages | PASS |
| Fraction batch | menu start confirmation, actual click with sync blocked, wellbeing dialog, next question, confidence selection | mobile 320, 390, 430 | PASS |
| Existing app UX | 41 Vitest cases | DOM/integration environment | PASS |
| Existing accessibility | 34 Vitest cases | DOM/integration environment | PASS |
| Existing integration | 169 Vitest cases | DOM/integration environment | PASS |
| Production build | tsc, Vite, standalone and Worker dry-run | Node/npm build | PASS |

### Commands run

- `npm run typecheck` — PASS
- `npx tsc -p tsconfig.tests.json --noEmit` — PASS
- `npm run test:ux` — 41 passed
- `npm run test:a11y` — 34 passed
- `npm run test:integration` — 169 passed
- `npm run build` — PASS (Cloudflare Worker **dry-run** only; no deployment)
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/lib/chromium/chromium npx playwright test e2e/ui-audit-regressions.spec.ts e2e/wide/ui-audit-regressions.spec.ts --workers=2` — **22 passed**.

## Behaviors requiring additional authorized / physical testing

- Real Google sign-in, persisted login, owner identity, Drive/Notion sync conflicts and permission scenarios: **NOT TESTED** without account access.
- TalkBack and VoiceOver, physical keyboard/browser combinations: **NOT TESTED** on physical devices.
- True full 20/30-question graded end-to-end runs with every possible answer type: **NOT EXHAUSTIVE**; existing unit/integration and selected browser journeys provide coverage.
- Screenreader live announcements, 400% zoom and long math formulas with all nested structures: **NEEDS DEVICE TESTING**.
- UX decisions about mutually exclusive inline setup panels and lengthy Sync sections: **DESIGN REVIEW**, not confirmed defects that justify silently redesigning an approved screen.
- Existing open PR #56 modifies separate Drive bank panel and styles; left untouched to avoid conflicts.

## UX tradeoff

The sync banner is **no longer a fixed overlay**. It appears in document flow after the editor. This guarantees click access to the editor, menus, and overlays, and avoids moving the core notebook when the connection changes. It means the sign-in control may require scrolling on small screens; that discoverability should be evaluated on a real device before final design approval.

## Quality policy

A passed automated test only confirms the tested assertion under its named environment, not universal behavior. New test failures caused by a wrongly broad selector or MathLive shadow text aggregation were corrected, then all 22 browser tests were rerun to a clean pass. No work is published to `main` by this change.


## Expanded state/event execution (additional evidence)

The following tests were executed on the same isolated patched project checkout:

- `e2e/mobile-accessibility.spec.ts` plus `e2e/accessibility/keyboard-and-adaptations.spec.ts`: **89/89 PASS** (three phone sizes; touch/click cancellation, tab focus, keyboard shortcuts, 200% font, rotated layout, scroll, long formulas, clipboard, undo and redo).
- `e2e/accessibility/axe-states.spec.ts`: **27/27 mobile PASS** + **36/36 laptop/desktop PASS**. Nine accessibility states each: single edit, batch edit, menu, symbols, confidence, invalid confidence, completion, New Problem, malformed JSON. Axe automated checks do not establish complete manual WCAG compliance.
- `e2e/persistence`: **71/71 PASS** — multiple browser tabs, IndexedDB, migration, persistence after reload, offline-outbox, backups, mock authenticated flow. **This does not test real Google authorization.**
- `e2e/lessons`: **21/21 PASS** — lesson navigation, RTL/Bidi, lesson math, image fallback, keyboard, and progress persistence.
- `e2e/mathlive.spec.ts`: **3/3 PASS**, including editing complex math fields and saved step identity.
- `npm run test:wide`: **42/42 PASS**; `npm run test:property`: **3/3 PASS**; `npm run test:architecture`: **5/5 PASS**.
- Other `e2e/practice-answer-types.spec.ts`, `e2e/learning-events.spec.ts`, `e2e/mobile.spec.ts`, `e2e/visual`: **36 passed, 4 visual snapshot failures**.
- Adding `UI-AUDIT-07`: three more responsive UI regression checks PASS. New audit regression suite now has **25 tests** across seven device projects (including the 6-case viewport sequence repeated on mobile projects).
- Across these suites: **602 successful individual test executions** when including Vitest group runs; some tests are repeated across overlapping suite selection patterns. This is a *run count*, not 602 unique features.

### Visual baseline investigation: no hidden threshold increase

At 390 and 430 pixels, four patched-version screenshot comparisons (`batch-edit` and `confidence` in each size) exceeded their existing pixel-diff thresholds. The **unchanged original baseline code** at commit `f849cea5`, run on a second local Vite port with the same Chromium environment and unchanged screenshot expectations, failed **all six** screenshot comparisons at 390 and 430 (including `single-edit`).

Thus these mismatches are **not solely introduced by this PR**; screenshot baseline/environment drift is strongly indicated, though the four failures remain an open visual-review task. No screenshots were silently regenerated, and no pixel thresholds were loosened.

### Additional UX behavior

Previously, separately opening Session backup and then Start diagnostic left both panels visible. The `openInlinePanel` handler now selects one of new exercise, JSON backup, fraction confirmation, or diagnostic confirmation at a time. A regression test switches through all four states via menu click/keyboard and checks that the prior setup panel is absent.

### Release gate

The PR targets main but is **not merged**. CI status must be inspected again after the latest commit, and live publication requires the existing GitHub Pages deployment workflow. Browser tests are backed by controlled fixture data; do not infer verified owner sync/real device results from the successful test count.
