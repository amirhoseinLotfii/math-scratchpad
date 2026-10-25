## 0.5.1 regression additions — 2026-10-25

- Tests added for simplified vs unsimplified negative fractions/integers, ambiguous adjacent notation and directional Delete/Backspace at insertion gaps.
- Existing v0.5 diagnostic, navigation and responsive tests are retained.
- Confirm the actual results in the GitHub Actions run for the new commit; this section does not claim physical device validation.
- Remaining device checks: hardware keyboard/IME, modal focus, screen readers, host overlay and cross-chat persistence.

---

## Verification report — 0.5.0 (2026-10-25)

GitHub Actions run: https://github.com/amirhoseinLotfii/math-scratchpad/actions/runs/40197474405

- **42 passing automated tests** across four suites (`app`, `store`, `assessment`, `legacy`).
- `npm test`: **passed**; `npm run build`: **passed** (strict TypeScript check, Vite and single-file integration artifacts).
- Regression coverage includes initial closed keyboard, desktop side-panel placement, LTR math, Persian-only problem stem, same-level horizontal navigation, fraction vertical navigation, structural Delete and Ctrl+Z, arrow-operated Insert chooser, Next/Previous with saved problem-specific steps, exact rational equivalence, simplified-form warnings, inconsistent equalities, malformed fraction handling and import of the previous 30-answer JSON format.
- **Not yet device-verified:** physical laptop keyboard layouts/IME edge cases, Android/iOS touch, focus with third-party hosts, screen readers and cross-chat persistence. Passing JSDOM tests do not prove those behaviors.
- Diagnostic scores are provisional. Unsupported mathematical notation and imported free-text fields require manual review; they are not silently assigned a zero.

---

# Verification report — 0.4.0

Executed in the build environment on 2026-10-23 using Node.js 24.19.0.

## Automated results

- `npm test`: **29 passing tests** across reducer/session and React DOM suites.
- `npm run build`: strict TypeScript check, Vite production build and self-contained bundle generation succeed.
- React DOM tests use JSDOM. Digit-coordinate tests use measured-rectangle fixtures, not a physical touchscreen.
- Historical GitHub CI for the 0.3.0 implementation commit [completed successfully](https://github.com/amirhoseinLotfii/math-scratchpad/actions/runs/39984286504).

| Required scenario | Evidence | Result |
| --- | --- | --- |
| Initial `2/3 + 1/4` | AST and rendered token order `2,3,+,1,4` | Passed in DOM |
| Touch 2 and 3 maps to first numerator/denominator | Separate stable node IDs and field paths | Passed in DOM |
| Select and change + | Only operator changes; both fractions retained | Passed in DOM |
| Touch 1 and 4 maps to second numerator/denominator | Separate stable node IDs and field paths | Passed in DOM |
| Digit position in 123 | Span midpoint fixture → caret 1 → insert 9 → 1923 | Passed in DOM |
| Main-line fraction insertion | Boundary insertion adds operator and empty fraction, preserves denominator | Passed |
| Numeric keypad LTR | Exact 4-column DOM key ordering | Passed |
| English-only math UI | Default product text has no Persian/Arabic codepoints | Passed in DOM |
| Independent steps | Earlier edit retains later values and marks them Needs review | Passed |
| One keyboard at the selected step | Old steps remain rendered; keyboard moves to active step | Passed in DOM |
| Next through fraction and integral fields | Correct field sequence, then main-line boundary | Passed |
| Structure clipboard/history | Clone IDs differ; cut/paste and Undo preserve tree | Passed |
| Copy review | Complete prompt, ordered scope and explicit final only | Passed |
| Clipboard blocked | Selectable text appears; Copied is not shown | Passed in DOM |
| Legacy clipboard fallback | Success flag checked and helper removed | Passed in DOM |
| New problem preserves old exercise | Original notebook unchanged, fresh blank step | Passed |
| Recents/favorites and template catalog | Four unique recent entries, favorites, all structure types | Passed |
| Session import | v2 roundtrip, v1 migration, invalid and duplicate IDs rejected | Passed |

## Additional 0.4.0 regression checks

- Read-only original-problem rendering has the correct token order and cannot move the editor cursor.
- Browsing a topic and its template preview does not mutate math; Insert template inserts it and returns to the keyboard.
- Edited and Needs review badges track real math changes while later values stay intact.
- Structure selection highlights the whole fraction; Copy/Duplicate preserve its nested fields.
- New-step/final-answer metadata changes do not mark unrelated steps stale.
- Edit metadata survives session roundtrip and is restored by Undo.

## Not executed / not claimed

- Physical touch-hit geometry in ChatGPT Android.
- Screenshots and computed-layout validation at mobile widths.
- Host reply composer overlap, in-chat clipboard permission behavior and persistence duration.
- TalkBack, font fallback and all nested-template ergonomic cases.

## Device checklist

At 320, 360, 412 and 768 CSS px, with either host theme (the product stays dark): verify the 5 initial token targets, insert an empty fraction beside an existing one, edit the middle digit of 123, add and revisit 3 steps, open Symbols and return, close/reopen keys, copy/review manually and scroll a matrix. Confirm the host composer never makes the active controls unreachable. Record device and host versions with results.
