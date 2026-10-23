# Verification report — 0.3.0

Executed in the build environment on 2026-10-23 using Node.js 24.19.0.

## Automated results

- `npm test`: **23 passing tests** across reducer/session and React DOM suites.
- `npm run build`: strict TypeScript check, Vite production build and self-contained bundle generation succeed.
- React DOM tests use JSDOM. Digit-coordinate tests use measured-rectangle fixtures, not a physical touchscreen.

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

## Not executed / not claimed

- Physical touch-hit geometry in ChatGPT Android.
- Screenshots and computed-layout validation at mobile widths.
- Host reply composer overlap, in-chat clipboard permission behavior and persistence duration.
- TalkBack, font fallback and all nested-template ergonomic cases.
- Remote GitHub CI until the repository exists and the workflow actually runs.

## Device checklist

At 320, 360, 412 and 768 CSS px, in light and dark themes: verify the 5 initial token targets, insert an empty fraction beside an existing one, edit the middle digit of 123, add and revisit 3 steps, open Symbols and return, close/reopen keys, copy/review manually and scroll a matrix. Confirm the host composer never makes the active controls unreachable. Record device and host versions with results.
