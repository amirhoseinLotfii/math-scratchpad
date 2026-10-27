# Approved phone design — executable test contract

Scope: the approved PHONE screen and its flows. Other device redesigns and publishing are excluded. Production has now been implemented against this contract; actual outcomes are recorded in MOBILE_TEST_RESULTS.md.

## Requirement-to-test matrix

| Area | Required behavior and failure boundaries | Executable evidence |
|---|---|---|
| Question & progress | Original prompt never changes when editing; first/last navigation bounds; selected question restores work | mobile-boundaries, mobile-controls, mobile-flow, browser journeys |
| Language & direction | English controls, statuses, confidence and timer; Persian question prose RTL; math LTR | mobile-controls, mobile-timer, mobile.spec, existing app tests |
| Number input | 1–9 then 0 order; touch edits active expression; decimals, 60-character limit, invalid input, Backspace, Delete | mobile-boundaries, mobile-controls, keyboard-ux, browser keypad tests |
| Caret navigation | Traverse digits before siblings; fraction field movement; focus and pointer selection remain consistent | keyboard-ux, store, app tests |
| Quick templates | Fraction, parentheses, root, power, equals in approved order; insert into active step, preserve original question | mobile-controls, mobile-boundaries, mobile.spec |
| More tools & Symbols | Reachable actions; opening does not move math caret; slash chooser; Escape and Tab handling | mobile-controls, keyboard-ux, app, browser focus tests |
| Add step | Append one blank step, select it; max 40; button between editor and templates; scroll active editor into view | mobile-controls, mobile-boundaries, mobile.spec, mobile-accessibility |
| Reset step | Named-step targeting, preserve siblings/questions; Undo restores expression | mobile-session, mobile-controls, browser reset/Undo |
| Delete step | First step never deletable or implicitly cleared; later deletion preserves neighbors, valid caret, accessible renumbering | mobile-session, mobile-boundaries, mobile-controls, browser icon tests |
| Undo/Redo | Question-local history; restore math/caret without rewinding time/confidence; new edit invalidates redo | keyboard-ux, mobile-boundaries, store tests |
| Time | Monotonic accumulation, partial-second flush, manual pause, suspension, blur/focus, pagehide, visibility, delayed attribution, invalid deltas | mobile-timer, mobile-boundaries, keyboard-ux |
| Confidence | No inline mobile field; no default; Low/Medium/High; explicit Continue, Cancel, Escape, existing choice, rapid repeats | mobile-confidence, mobile-flow, keyboard-ux, browser modal test |
| Batch navigation | Preserve answers/steps/confidence/time; no wrapping; skip explicitly without inventing confidence | mobile-flow, mobile-confidence, mobile-boundaries |
| Batch vs single | Batch review in menu, not footer; single question retains primary review; final batch shows completion actions | mobile-controls, mobile-flow, mobile.spec, browser completion |
| Completion | Final confidence then completion dialog; explicit Review and Copy JSON; no automatic copy | mobile-flow, browser completion |
| Full JSON copy | All questions, expressions, ordered steps, metadata/time/confidence/final flags; not just active question; available before completion | mobile-session, mobile-boundaries, mobile-flow, browser clipboard |
| Copy errors | Await real success; native denial, legacy success/failure/throw; cleanup and focus restoration; manual selectable fallback | mobile-clipboard, mobile-flow, app, browser copy denial |
| Import/recovery | Reject empty/invalid/duplicate/unknown/excessive sessions; migrate legacy format; stale-cursor recovery; load clears unrelated Undo | mobile-boundaries, store, legacy tests |
| Student-data isolation | Export contains user work, not answer-bank expected answers or internal Undo history; export does not mutate work | mobile-boundaries, mobile-session, browser clipboard |
| Mobile layout | 320/390/430 widths; no page overflow; long formula local overflow; 44×48 minimum keypad targets; icon hit areas; action order; use surplus height | both E2E files |
| Accessibility | Semantic names for icons, disabled first deletion, modal focus trap, Escape, restored focus, visible/reachable active editor | integration controls/confidence, browser focus tests |
| Resize/text scaling | Increased text size reflows; landscape rotation preserves answer; controls remain reachable | mobile-accessibility |

## Test layers and commands

- `npm run test:unit`: isolated store and persistence boundaries in `tests/unit/`.
- `npm run test:integration`: React/store integration and clipboard/timer lifecycle in `tests/integration/`.
- `npm test`: all unit/integration and existing parser, assessment, legacy and keyboard regression cases.
- `npm run test:typecheck`: TypeScript checks for application AND tests/configuration.
- `npm run test:coverage`: V8 lines/statements/functions/branches, including untested entrypoints; reports failures rather than hiding them.
- `npm run test:e2e`: actual Playwright/Chromium browser workflows, each at 320×844, 390×844 and 430×844. Rotation and taller-window cases resize within their scenario.

Fixtures use synthetic local sessions. No real learner session is submitted or altered. Clipboard mocks restore property descriptors. Tests do not rely on random IDs, arbitrary sleep, execution order, or a real service.

## Interpretation of red tests

Acceptance tests for new mobile behavior are intentionally red against the existing UI. Missing controls, first-step deletion and old inline confidence must not be silently skipped. The old inline-confidence assertion was migrated to the approved modal contract; clipboard regressions seed confidence through the store so they remain about clipboard behavior. Old invalid Testing Library `exact` options were removed; exact string accessible-name matching is already the default.

A dialog implementation may reject invalid Continue by disabling it or showing an error; tests require that navigation does not happen. Time comparisons are monotonic rather than frozen while components mount/unmount.

## Browser and physical-device limits

Playwright now executes against actual Chromium. The reproducible bundled fallback is prepared with npm run test:browser:prepare; a regular Playwright installation or explicit executable path is also supported. Discovery alone still never counts as execution.

Physical-device acceptance remains necessary for Android status bars, browser toolbar resizing, safe-area insets, gesture navigation, clipboard permissions and TalkBack. The OS status bar in the mockup is not app-rendered content. Browser emulation cannot prove these behaviors.

## Coverage policy

Use the measured report and the requirement matrix together. A large count does not prove all behaviors, and 100% statement coverage does not prove visual usability. Do not loosen assertions to make the approved behavior pass. Once behavior is implemented, run all regressions and browser scenarios, inspect phone rendering, and record actual results before calling the mobile release ready.


## Accessibility and architecture expansion

The detailed current contracts are in `docs/testing/accessibility-ux-contract.md`, the physical-device protocol in `docs/testing/manual-protocol.md`, and the requested Zustand/shadcn/RHF/Zod structure in `docs/architecture/mobile-stack.md`. Current results supersede earlier baselines and are recorded in `MOBILE_TEST_RESULTS.md`. New menu actions use menuitem roles; single-question and completion actions use button roles. The current Playwright suite contains 171 executions (57 definitions across three phone widths); see the measured results for the latest run.
