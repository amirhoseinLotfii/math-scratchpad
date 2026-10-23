# Design system

The interface prioritizes direct editing, visible reasoning and two-thumb input. The single keyboard sits directly below the active editable expression. Selecting an earlier step moves the keyboard there without duplicating formulas or reordering steps.

## Foundations

- Tokens are root-scoped `--ms-*` CSS properties. Surface, text, keys, border, primary, selection and warning colors follow `light-dark()`.
- System UI fonts for controls; a system math/serif stack for equations. No downloaded fonts.
- A 6–12 px spacing rhythm, 12 px control radius and restrained boundaries between steps.
- Native buttons and fields retain browser focus indication. Controls are at least 44 px wide and 48 px high. Every action has a visible label or accessible name.
- Selected controls use both appearance and `aria-pressed`; status labels communicate state in words.

## Direction and layout

- The product root and every math sequence explicitly use `dir="ltr"`; CSS uses `unicode-bidi: isolate`.
- Original Persian problems use `dir="auto"` outside the math editor. They are not parsed into editor labels.
- Top-level expressions wrap at operators, keeping an operator attached to its right-hand term. Wide atomic chunks and matrices have contained horizontal scrolling.
- Numeric keys use a fixed LTR 4-column order. Compact mode removes the permanent variable row; it does not shrink tap targets.
- The product reflows down to a 320 px target width. It has no fixed viewport shell or floating keyboard that assumes control of ChatGPT chrome.

## Components and states

| Component | States / interaction |
| --- | --- |
| Numeric token | Idle, caret active, empty placeholder; tapping chooses the nearest measured digit boundary |
| Structure | Unselected or whole structure selected; parent selection available by button |
| Main-line gap | Visible dot, active insertion caret; never selects a fraction child |
| Step | Active, inactive, later step needs review, explicit final |
| Symbols | Topic categories, optional recent row, favorite toggles |
| Review | Idle, copying, copied, changed since copy, blocked manual fallback |

## Remaining validation

Targets and CSS rules do not prove mobile usability. Confirm actual wrapping, target bounds, host composer occlusion, TalkBack announcements and contrast in the Android host before calling accessibility or device support complete.

Design references: [Android accessibility](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility), [W3C text direction](https://www.w3.org/International/questions/qa-html-dir), [WCAG reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [MathLive commands](https://mathlive.io/mathfield/guides/commands/).
