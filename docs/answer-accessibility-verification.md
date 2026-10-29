# Math Scratchpad — implementation and verification

Branch: `fix/answers-keyboard-accessibility`. Base: `201f90b5bdfd2069709c189f0ff524415ad83d38`. Implementation: branch commits include the final audit corrections and verification report. Original GitHub Pages main has not been deployed by this work.

## Scope and compatibility

The original formula editor remains AST-backed with expression slots, steps, Add step, Final, confidence and undo/redo. Textareas appear only for text responses. Banks receive no answers. Drive account, token, picker and file loading code is unchanged apart from panel focus, labels/disclosures and optional response metadata validation. Session backups remain `version: 2`; added fields are optional. Legacy text-mode exercises with saved numeric work retain their existing math export instead of losing that work.

## Audit and resulting behavior

| Feature | Expected | Implemented / verified |
| --- | --- | --- |
| Question loading / navigation | Focus math main, text textarea or first choice | Added guarded animation-frame focus; verified all three in Chrome. |
| Text source | Always show plain source below prompt | 4,035 and the spelled-out number render; direction auto; no math parsing. |
| Text input | All scripts, punctuation and spaces | Textarea preserves mixed Persian/English verbatim. |
| Choice input | Radio semantics, arrows, Enter/Space, visible selection | Large buttons use aria-checked and roving Tab stop; selected < captured. |
| Math input | Keep AST slots and undo history; direct structure shortcuts | Existing editor retained; / fraction, ^ power, Alt+R root, arrows and step shortcuts supported. |
| Menu | Native menu button; arrows/Home/End; Escape returns to ⋮ | Radix dropdown retained; Show more starts collapsed; Session/Practice/Data/Help/Danger groups. |
| Disclosure | Enter/Space, aria-expanded, upward expanded indicator | Show more prevents menu dismissal and exposes expanded state. |
| Batch modal | Centered dialog; two scales; initial focus; trap; Escape skip | Native 1–5 radios, optional unset/clear, selected accent; focus returns to editor. |
| Math toolbar | One Tab stop; arrows/Home/End within toolbar | Roving focus; typing on toolbar controls does not modify math. |
| Questions sidebar | Arrows/Home/End focus; Enter activates; statuses retained | Existing list retained; visible from 1200px; native selector on smaller widths. |
| Confidence / Next | Reachable by keyboard; no invented confidence | Radio group focus; explicit Continue; modifier navigation invokes same confidence flow. |
| Inline backup / Drive panels | Visible controls must remain interactive and receive focus | Fixed inert-parent bug and added panel focus. Dialogs remain modal. |
| Finish / analyze | No action that silently does nothing | Analysis appears only for diagnostic sessions; all completions show counts. |
| Visible focus / order | Dark theme ring, no positive tabindex, no focus traps | Focus rings and roving controls; existing axe/structure tests pass. |
| Previous / next shortcut | Avoid browser back/forward conflicts | Ctrl+Alt+Left/Right or Cmd+Option+Left/Right. No single-key bracket shortcuts. |
| Backups / exports | Version 2 plus optional fields; old sessions load | Old session and legacy math exports pass tests; no answers added to bank. |

The choice buttons expose `role=radio` and `aria-checked`, the correct selected-state contract for a radio group, rather than mixing toggle-button semantics into radios.

## Contrast: computed WCAG relative luminance

The threshold is 4.5:1 for normal text and 3:1 for required control boundaries/focus against their adjacent dark surface. Disabled controls are exempt in WCAG; their text was checked voluntarily. Decorative card borders need not meet the control criterion, but use the same token. The selected control's fill is not its only indicator: checked state, outline and screen-reader state distinguish it. Focus ring against the accent fill itself is not claimed to be 3:1; the offset ring sits against the dark adjacent surface.

| State / element | Foreground | Background | Ratio | Target | Result |
| --- | --- | --- | --- | --- | --- |
| Body text | `#F0F2F3` | `#151719` | 16.00:1 | ≥4.5:1 | Pass |
| Surface text | `#F0F2F3` | `#202326` | 14.06:1 | ≥4.5:1 | Pass |
| Secondary text | `#BEC5C9` | `#292D30` | 7.95:1 | ≥4.5:1 | Pass |
| Hover text | `#F0F2F3` | `#34393D` | 10.40:1 | ≥4.5:1 | Pass |
| Disabled text (exempt; voluntarily checked) | `#AAB2B7` | `#202326` | 7.34:1 | ≥4.5:1 | Pass |
| Border on surface | `#80888D` | `#202326` | 4.38:1 | ≥3:1 | Pass |
| Border on raised surface | `#80888D` | `#292D30` | 3.85:1 | ≥3:1 | Pass |
| Border on hover | `#80888D` | `#34393D` | 3.24:1 | ≥3:1 | Pass |
| Success | `#8FA89A` | `#292D30` | 5.45:1 | ≥4.5:1 | Pass |
| Success on hover | `#8FA89A` | `#34393D` | 4.58:1 | ≥4.5:1 | Pass |
| Warning | `#E6C27A` | `#292D30` | 8.17:1 | ≥4.5:1 | Pass |
| Error / danger | `#E8A0A0` | `#292D30` | 6.59:1 | ≥4.5:1 | Pass |
| Danger on hover | `#E8A0A0` | `#34393D` | 5.54:1 | ≥4.5:1 | Pass |
| Primary normal text | `#101A14` | `#86B99B` | 7.99:1 | ≥4.5:1 | Pass |
| Primary hover text | `#101A14` | `#97C8A9` | 9.45:1 | ≥4.5:1 | Pass |
| Primary pressed text | `#101A14` | `#75A98A` | 6.61:1 | ≥4.5:1 | Pass |
| Focus ring on hover | `#8CBFFF` | `#34393D` | 6.12:1 | ≥3:1 | Pass |

Advanced tools have an expanded-list search and a close action at the top; Next field is distinguished from Next question. Drive access and recovery explanations are in disclosures. Reset confirmation has a separate danger style.

## Test results and coverage

- **705 automated tests passed**, 0 failed, across **40 test files** (`vitest run`, including existing math AST/property/export/Drive/persistence suites).
- Production TypeScript, test TypeScript, production Vite build and self-contained build passed.
- `git diff --check` passed.
- Live UI verified through Sites-managed preview in **Chrome**, using the actual React app. No image-generated mockup or replacement app was used.
- Browser width checks: **320, 390, 768, 1024, 1280, 1440, 1920px**. Text-screen document width equaled viewport width in every check (no horizontal overflow). Header height was 48px on narrow layouts and 44px on wide layouts.
- Live flow: import a version 2 session through UI → centered batch modal → arrow/Tab scales → Escape → math typing → Enter new step → negative number → Alt+Enter Final → Ctrl+Alt+Right → confidence radios/Continue → text answer focused → mixed English/Persian typing without clicking → sidebar choice → Space selects `<` → menu disclosure/Home/End/Escape.
- Math, text, choice, modal, menu top and scrolled menu bottom were captured at desktop/mobile widths. The two-line English/Persian prompt and number source are visible in screenshots.
- PA-1.1-03's source “two million, sixty thousand, nine” was checked in the actual browser.
- Ctrl+Alt modifier and Cmd+Option-equivalent Meta+Alt modifier are both covered by automated integration tests; **only Ctrl+Alt in Chrome was exercised as a live browser shortcut**.

The existing Playwright source scenarios were aligned with the new disclosure, toolbar roles and editor focus return. They were type-checked, **not executed in this managed preview**. Existing screenshot goldens describe the old palette/layout and still need regeneration/review in the repository browser pipeline before the full release gate can be considered passed.

### Limits of verification

**Firefox, physical Windows/macOS, real screen-reader output, real Google account authorization and a real device keyboard were not exercised.** No claim of full WCAG conformance or all state×viewport combinations is made. Drive behavior is covered by the existing mocked integration tests, not a new live login. Browser tests use a local disposable QA session with no bank answers.

## Changed files

| File | Change |
| --- | --- |
| `docs/answer-accessibility-verification.md` | Verification report. |
| `e2e/accessibility/axe-states.spec.ts` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `e2e/accessibility/keyboard-and-adaptations.spec.ts` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `e2e/mobile-accessibility.spec.ts` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `e2e/mobile.spec.ts` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `e2e/persistence/local-storage-sync.spec.ts` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `e2e/support/mobile-journey.ts` | Reveal Show more before the existing batch-start journey. |
| `e2e/wide/workspace.spec.ts` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `src/App.tsx` | Wire answer types, prompt/source rendering, grouped dropdown, header progress, batch scales, focus recovery, Ctrl/Cmd+Alt navigation and dialog close behavior; remove the Session details card and header shortcuts button. Keep the AST-backed step JSX. |
| `src/Keyboard.tsx` | Clarify Next field and the template guidance without changing math actions. |
| `src/features/drive-bank/drive-bank-panel.tsx` | Focus the panel on opening; compact access/recovery descriptions into disclosures and label controls in English; retain Drive operations. |
| `src/features/drive-bank/drive-bank.ts` | Validate optional answerType/choices and preserve them in new exercises; continue rejecting answers in banks. No network or authentication changes. |
| `src/features/math-editor/model/model.ts` | Add optional response metadata and answerText, defaults by question mode, and compatibility detection for legacy math work. |
| `src/features/math-editor/store/editor-store.ts` | Persist text/choice responses with confidence invalidation on edit; explicitly identify built-in fraction word problems as math answers. |
| `src/features/session/components/completion-dialog.tsx` | Show completion counts and backup guidance; offer analysis only for the diagnostic that supports it; restore editor focus. |
| `src/features/session/components/confidence-dialog.tsx` | Initial focus in the radio group without preselecting a value; close returns to the editor. |
| `src/features/session/components/scale-group.tsx` | New native radio pill group with Low/High labels, selection, keyboard support and clear-to-unset. |
| `src/features/session/components/session-panel.tsx` | Use shared pill scales; remove the card from App, preserving the component export. |
| `src/features/session/export/tutor-export.ts` | Add optional text/choice response fields. Preserve legacy math work and existing math export fields. |
| `src/features/session/schemas/session-schema.ts` | Validate optional response fields and choice membership. |
| `src/features/workspace/components/choice-answer.tsx` | New large choice radio buttons with selected state and arrow/Home/End selection. |
| `src/features/workspace/components/math-tools.tsx` | Labeled math toolbar with one Tab stop and arrow/Home/End navigation. |
| `src/features/workspace/components/question-navigator.tsx` | Remove duplicate progress; scroll the active item into view while retaining question buttons and statuses. |
| `src/features/workspace/components/question-prompt.tsx` | Display explicit English labels separately from Persian instructions, with appropriate direction. |
| `src/features/workspace/model/workspace-layout.ts` | Count text answers and legacy math work; document keyboard shortcuts; show desktop sidebar from 1200px. |
| `src/main.tsx` | Load the approved palette and state overrides last. |
| `src/persistence.ts` | Retain optional answerType, choices and answerText in bounded version 2 restore. |
| `src/review.ts` | Include optional text/choice response metadata in review payload. |
| `src/shared/hooks/use-workspace-layout.ts` | Match the desktop sidebar breakpoint at 1200px. |
| `src/styles/approved-theme.css` | Approved palette, contrast states, focus rings, visible Final controls, responsive header/menu/modal, neutral answer panels and selected states. |
| `tests/accessibility/dialogs.test.tsx` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `tests/accessibility/forms-and-menus.test.tsx` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `tests/accessibility/semantics.test.tsx` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `tests/app.test.tsx` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `tests/comprehensive/app-rtl-a11y.test.tsx` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `tests/comprehensive/ui.test.tsx` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `tests/fraction-round.test.tsx` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `tests/integration/answer-types-keyboard.test.tsx` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `tests/integration/drive-bank-ui.test.tsx` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `tests/integration/mobile-controls.test.tsx` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `tests/integration/mobile-flow.test.tsx` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `tests/integration/tutor-export-ui.test.tsx` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `tests/keyboard-ux.test.tsx` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `tests/unit/answer-type-schema.test.ts` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `tests/ux-batch/ux-batch.test.tsx` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `tests/wide/layout-model.test.ts` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |
| `tests/wide/workspace.test.tsx` | Update assertions for the requested layout, labels, disclosure or focus contract; retain existing functional checks. |

## Accessibility references applied

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): keyboard access, no trap, focus order, focus visible/not obscured, no navigation merely on focus.
- [APG menu button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/), [disclosure](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/), [modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [radio group](https://www.w3.org/WAI/ARIA/apg/patterns/radio/), [toolbar](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/): platform keyboard behavior and roving focus where appropriate.
- [MathLive keyboard shortcuts](https://mathlive.io/mathfield/guides/shortcuts/): structured math entry, slot navigation and dedicated math focus. The app keeps its existing editor rather than replacing it with MathLive.

## Run

```sh
npm ci
npm run dev
npm test
npm run test:typecheck
npm run build
```
