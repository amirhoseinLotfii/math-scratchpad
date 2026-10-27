# Laptop and desktop implementation contract

Scope: the approved physical-keyboard-first laptop and desktop designs, preserving the approved phone workflow. The phone app remains the shared engine and state; no separate desktop document/history/timer exists.

## Viewport rules

| Available CSS width | Layout | Question selection | Keyboard |
|---|---|---|---|
| Below 900 | Existing phone column | Existing dropdown | Existing explicit preference; new phone sessions open keys |
| 900–1599 | Two columns: question context / work | Dropdown in question column | Closed for fresh sessions; optional toggle |
| 1600 and above | Three columns for batches: question list / context / work | Named question buttons; one aria-current page | Closed for fresh sessions; optional toggle |

Width, not hardware identity, selects a layout. A single-question desktop uses two columns. Workspace width is capped at 1800 CSS pixels. The context and navigator use sticky positioning with bounded local scrolling; the notebook follows document flow. Long equations scroll inside the expression rather than widening the document. Zoom/narrow resizing returns the phone layout. Resizing preserves math, question selection, confidence, cursor and Undo/Redo; it does not silently rewrite the user's keyboard preference.

## Requirement and evidence matrix

| Area | Required behavior and boundaries | Tests |
|---|---|---|
| Layout thresholds | 899/900 and 1599/1600, ultrawide cap, short-height windows | wide layout model; WIDE-01/05/19/22/25 |
| Physical keyboard default | No automatic numeric keypad on fresh wide sessions or after starting a batch | DOM keyboard preference; WIDE-02 |
| Question context | Persian prose RTL, formula LTR, one per-question timer, remains visible during long work | Shared semantics/timer tests; WIDE-04; browser axe |
| Question navigator | Current question distinct from focus, named status and destinations, local scroll | DOM navigation; WIDE-06/07/24 |
| Question status | Blank is Not started; work is Draft; nonempty work plus explicit confidence is Answered; skipped takes priority | wide layout-model tests; shared validation |
| Browse versus continue | Browsing preserves unsent drafts without inventing confidence; Next still opens required confidence | WIDE-07/14/15; confidence DOM tests |
| Focus order | Toolbar appears in DOM before steps on wide layouts, after Add step on phones; no visual CSS reordering of controls | WIDE-03; DOM semantics; manual protocol |
| Symbol toolbar | Fraction, parentheses, root, power, equals; Undo/Redo scoped to active question; More opens shared chooser | DOM toolbar; WIDE-03/08/10/26/27; advanced-notation DOM cases; existing engine tests |
| Digit editing | Physical digit boundaries, Home/End, deletion, exact pointer hit placement, Undo | WIDE-09/23; keyboard-ux; editing properties |
| Step lifecycle | New step blank/active; first step protected; named reset/delete preserve other steps | WIDE-11/12; shared mobile and boundary tests |
| Shortcut help | Descriptive dialog, focus trap, Escape/Close restore trigger; displayed shortcuts match actual behavior | DOM shortcut help; WIDE-13/21 |
| Confidence and completion | No inline confidence; actionable required errors; cancel preserves work; final actions explicit | WIDE-14/15/16; shared axe states |
| Export/import | Full batch, ordered steps, confidence and time; native/legacy clipboard failure exposes selectable backup | WIDE-17; shared storage/validation/clipboard suites |
| Persistence | v1/v2 migration, v3 validation, corruption/quota protection, clean-tab sync, conflict decisions, no timer echo | Production runtime unit tests and persistence browser suite in all seven viewport projects |
| Accessibility | Browser WCAG scans include contrast, visible focus, native disabled, no duplicate IDs, reduced motion, forced colors | WIDE-20/21; shared axe nine states in seven projects |
| Visual regression | Single, batch, multi-step and shortcut modal; 1024×768, 1440×900, 1920×1080, 2560×1440 | WIDE-VISUAL; engineering-reviewed real browser baselines |
| Phone preservation | All original three phone projects and their approved baselines run unchanged | mobile projects; aggregate gate |

## Test tools and execution

Vitest/Testing Library/user-event test real React components and Zustand state; pure tests validate boundary/status policies. Playwright drives the actual browser and tests geometry, focus, mouse hit testing, dialogs, zoom-like reflow, copy fallback and synchronization. Axe scans retain incomplete findings for human review and disable no browser rules. Screenshot baselines mask only the changing timer. Screenshots are captured from running code, not generated mockups. No retries or skips are added to hide failures.

`npm run test:wide` runs the new DOM/model cases. `npm run test:wide:browser` includes the four wide projects, their browser behavior, axe states, storage tests and screenshots. `npm run test:gate` runs the complete seven-project regression plus types and coverage; `test:release` also requires evidence-bearing manual acceptance.

## Manual acceptance still required

The existing 12 phone checks remain pending. Six additional pending checks cover Windows/Linux Chrome keyboard-only operation, Firefox actual browser zoom, NVDA reading/navigation, macOS VoiceOver editing/dialogs, mouse/trackpad scrolling and caret placement, and user acceptance of both wide layouts. Record actual devices, OS/browser/AT versions and outcomes in the evidence for each check. Automated tests cannot stand in for these results. The persisted default has no fabricated reviewer, dates, evidence or passed statuses.
