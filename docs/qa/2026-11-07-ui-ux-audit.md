# Math Scratchpad — cross-device interaction QA / 2026-11-07

## Scope and status
- Repository baseline: `main@2355b9ad4f1b9d4d2d05192884c0f309e7e9ce13`.
- Target: React math editor, Learn inline checks/examples, responsive layout, shared virtual keyboard, and associated persistence/accessibility regressions.
- **Code review completed** for the active-step keyboard layout and corresponding CSS.
- **KERNEL visual execution BLOCKED**: the connected account rejected browser creation with HTTP 403 / billing payment-method requirement. No new runtime screenshots have been taken or visually approved in this review.
- New browser tests are authored but **NOT RUN** in this conversation. Do not treat screenshots emitted by those tests as existing until a CI or local Playwright execution produces them.
- Test artifacts use synthetic public fixtures, not authenticated learner records.

## Evidence-based finding
**QA-LESSON-01 (P1)**: Previously, `LessonMathCheck` rendered its virtual keyboard *after* the entire `.lesson-answer-steps` list, so when multiple editable steps exist, the keyboard is separated from the currently selected step. The existing `keyboard-placement-regression.spec.ts` checked placement relative to the entire steps list but not adjacency to the active step.

**Targeted change**: Render the same `Keyboard` component once, as an immediate sibling of the active step inside the shared steps grid; keep the same store, mathfield adapter and one-keyboard ownership. Honor the independent wide work-pane scroll container, preserving focus. Bring lesson editing target heights to 48px and keep the approved dark theme and design tokens.

## State-transition inventory — expected screenshots/assessments
| ID | Surface | Before | Event | After | Priority |
| --- | --- | --- | --- | --- | --- |
| L-01 | Learn section | Collapsed inline check | Expand | Only selected editor opens; focus moves to mathfield | P1 |
| L-02 | Learn math | Keyboard closed | Show Keyboard | Exactly one keypad below active expression | P1 |
| L-03 | Learn math | One step, keypad open | Add step | New active step inserted, keypad follows new step | P1 |
| L-04 | Learn math | Second step active | Click Step 1 | Keypad follows Step 1; other expression retained | P1 |
| L-05 | Learn math | Keyboard open | Hide Keyboard | Keypad removed, step contents retained | P1 |
| L-06 | Learn checks | Check A active | Expand Check B | A keypad closes, B alone owns keyboard | P1 |
| L-07 | Worked example | Editor closed | Solve example | Same reusable step editor opens inline | P1 |
| L-08 | Worked example | Entered expression | Close/reopen | Answer restored; no extra attempt recorded | P1 |
| L-09 | Wide work pane | Text pane visible | Solve in Your work | Selection and active editor appear in split pane | P1 |
| L-10 | Wide work pane | Keypad open | Add/switch step | First key remains visible within *nested* scroller | P1 |
| A-01 | All | Default state | Tab, Shift+Tab, Escape | Focus visible, modal focus restored, no trap escape | P1 |
| A-02 | All | Narrow viewport | Open panel / zoom | No unintended page-wide horizontal overflow | P1 |
| A-03 | All | Math and Persian content | Edit/navigation | Math is LTR; prose RTL/auto and isolated | P1 |
| A-04 | Mobile | Editor and overlays | Rotate/resize, keyboard | No obstructed tap targets or forced scroll jumps | P1 |
| D-01 | Design tokens | Dark charcoal/forest theme | Hover/focus/pressed | Consistent semantic color, borders, radius and contrast | P2 |
| D-02 | Spacing | Toolbar and cards idle | Expand/collapse | Stable gaps/padding without unwanted layout shift | P2 |
| S-01 | Sync | Offline | Edit / reload | Local draft remains available for recovery | P0 |
| S-02 | Sync | Disconnected → authenticated | Connect / refresh | Session identity and pending local work remain intact | P0 |
| S-03 | Sync | Two versions | Conflict | Explicit decision; neither version silently overwritten | P0 |
| S-04 | Backup | Existing chapter data | Export / import | JSON round trip without loss or duplication | P0 |
| S-05 | Dangerous actions | Live data | Reset / delete | Explicit scope, confirmation and preserved backup contract | P0 |

## Coverage plan
- Mobile: 320×568, 390×640, 390×844, 430×932.
- Tablet: 768×1024, 820×1180.
- Laptop: 1024×768, 1100×900, 1440×900.
- Desktop: 1920×900/1080; 2560×1440 remains existing suite coverage.
- Screen pairs captured on fixture transitions via `testInfo.attach` and `testInfo.outputPath`, not stored in git or collected from real accounts.
- New suites: `e2e/lessons/keyboard-adjacent-audit.spec.ts` and `e2e/wide/keyboard-adjacent-audit.spec.ts`.
- Existing suites relevant to follow-up: `e2e/ui-audit-regressions.spec.ts`, `e2e/lessons/keyboard-placement-regression.spec.ts`, `e2e/visual/*`, `e2e/persistence/*`, `e2e/accessibility/*`.

## Verification commands
```sh
npm ci
npm run typecheck
npx playwright test e2e/lessons/keyboard-adjacent-audit.spec.ts --project=mobile-390
npx playwright test e2e/wide/keyboard-adjacent-audit.spec.ts --project=laptop-1440
npm run test:ux
npm run test:a11y
npm run test:integration
npm run test:sync
npm run test:visual
npm run build
```
All above commands are **NOT RUN** as part of this review. PR CI should supply real execution results; visual review requires inspecting generated PNG pairs.

## Definition of done
1. Every documented interaction has a reliable before/after state and assertion for each applicable breakpoint.
2. All critical logic (draft retention, sync, conflict, backup and destructive flows) passes repeatable tests.
3. No new visual/accessibility regressions; screenshot diffs are reviewed, not auto-approved.
4. Physical Android keyboard occlusion and screen-reader acceptance remain **NEEDS DEVICE TESTING**; browser emulation alone is insufficient.
5. Merge only after actual CI results, manual image review and user approval.
