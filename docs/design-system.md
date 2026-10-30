# Design system

The interface prioritizes direct editing, visible reasoning and two-thumb input. The single keyboard sits directly below the active editable expression. Selecting an earlier step moves the keyboard there without duplicating formulas or reordering steps.

## Foundations

- Tokens are root-scoped `--ms-*` CSS properties. The image-inspired product uses a fixed charcoal/forest-green theme with mint selections and amber review warnings. It stays dark in either host theme; ChatGPT chrome is owned by the host.
- System UI fonts for controls; a system math/serif stack for equations. No downloaded fonts.
- An 8 px spacing rhythm, 14 px control radius, 18 px step cards and a 24 px product shell. Matte gradients and mint structure outlines follow the approved image direction; marketing captions and magnifiers are not part of the editor.
- Native buttons and fields retain browser focus indication. Controls are at least 44 px wide and 48 px high. Every action has a visible label or accessible name.
- Selected controls use both appearance and `aria-pressed`; status labels communicate state in words.

## Direction and layout

- The product root and every math sequence explicitly use `dir="ltr"`; CSS uses `unicode-bidi: isolate`.
- Original Persian problems use `dir="auto"` outside the math editor. They are not parsed into editor labels.
- Top-level expressions wrap at operators, keeping an operator attached to its right-hand term. Wide atomic chunks and matrices have contained horizontal scrolling.
- Numeric keys use a fixed LTR 4-column order starting with `1 2 3` at the top, then `4 5 6`, then `7 8 9`. Backspace occupies the top-right quick-template slot; cursor navigation stays below the numeric keys. Compact mode removes the permanent variable row; it does not shrink tap targets.
- The product reflows down to a 320 px target width. It has no fixed viewport shell or floating keyboard that assumes control of ChatGPT chrome.

## Components and states

| Component | States / interaction |
| --- | --- |
| Numeric token | Idle, caret active, empty placeholder; tapping chooses the nearest measured digit boundary |
| Structure | Unselected or whole structure selected; parent selection available by button |
| Main-line gap | Visible dot, active insertion caret; never selects a fraction child |
| Step | Active, inactive, genuinely edited, later step needs review, explicit final |
| Symbols | Topic categories, recents and favorites, insertion rows and a read-only template preview |
| Review | Idle, copying, copied, changed since copy, blocked manual fallback |

## Implemented image-to-product details (0.4.0)

- Original math problems render with the same formula renderer in read-only mode; source text remains unchanged in review payloads. Unsupported imports remain visible as source text.
- Lesson prose is never sent through the math parser. Only explicit inline delimiters are parsed as formulas; supported read-only notation uses the existing AST renderer, while unsupported notation stays visible with an explicit fallback label.
- Problem and template previews contain no editable buttons, insertion gaps or active caret. Editable steps still have a single direct-interaction surface.
- Every step is a separate rounded card. `Edited` records an actual expression change and survives session transfer; Undo restores that state. Editing earlier math preserves later expressions and marks them `Needs review`.
- Adding a blank step or toggling the final-answer flag does not invalidate math in other steps.
- Symbols use readable topic controls, symbol/title rows and star toggles. A topic-specific editable-template preview has an explicit insertion button.
- Symbol list and preview sit beside one another when the product has room; container queries stack them at 520 px and simplify controls below 400 px. The host viewport is not assumed to equal the editor width.
- Whole-structure actions have a labeled selection panel and an internal-clipboard explanation. Check retains the manual copy/paste review flow.
- Session backup explains text copying, external storage and restoration instead of promising automatic downloads or cloud synchronization.

## Remaining validation

Targets and CSS rules do not prove mobile usability. Confirm actual wrapping, target bounds, host composer occlusion, TalkBack announcements and contrast in the Android host before calling accessibility or device support complete.

Design references: [Android accessibility](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility), [W3C text direction](https://www.w3.org/International/questions/qa-html-dir), [MDN `dir`](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/dir), [WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), and [WCAG reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). The current app-owned formula editor and read-only renderer remain in use; external math libraries are deferred.
