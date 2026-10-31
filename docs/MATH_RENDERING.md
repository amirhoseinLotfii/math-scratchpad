# Math rendering and editing

**Reviewed:** 2026-10-31
**Current editor/display library:** MathLive 0.111.1 (MIT)

## Responsibilities

- `MathDisplay` uses MathLive's read-only `<math-span>` and `<math-div>` custom
  elements for question expressions, lesson formulas, inline notation, and
  table cells. Its local static CSS and fonts are bundled with the app.
- `MathLiveStepInput` adapts MathLive's `<math-field>` to the existing per-Step
  editor. Step IDs and Final/review state stay in the existing session model;
  exact MathLive LaTeX is saved in `mathLatex` and the prior AST continues to
  support older data and operations the app already understands. Learn checks
  still use their separate Learn progress store.
- Neither rendering nor editing solves or grades an expression. There is no
  graph/geometry renderer and no bank-provided JavaScript execution path.

The app's existing math keypad remains an explicit app control. MathLive's own
virtual keyboard is set to manual mode; its built-in keyboard and menu toggles
are hidden because the app supplies its own math tools.

## Why MathLive is the current choice

The existing editor represents a restricted AST and is not sufficient for the
required nested notation and formula entry. MathLive provides an actively
maintained React-compatible custom element, structured editing, caret and
selection APIs, native undo/redo, placeholders, and static formula elements.
The application uses the DOM custom elements through a small adapter rather
than replacing session, Step, or export structures.

The live bank inspected during this work contains a 13-concept Persian lesson
with formulas and LaTeX `array` tables. The app converts bounded array tables
to semantic, locally scrollable HTML tables; other formulas use MathLive's
static renderer. Browser tests also render a nested fraction, a matrix,
derivative notation, an integral, and a limit. This is evidence for the current
content, not a promise of universal LaTeX support.

MathJax and KaTeX were not added. MathLive static rendering covered the
verified lesson and test notation, so another renderer would add weight and a
second source of layout and accessibility behavior without a demonstrated
rendering gap. MathLive bundles KaTeX-named font assets internally; the app
does not import the separate KaTeX renderer.

JSXGraph was evaluated separately and not installed. The verified lesson data
has no graph or interactive-geometry block. If such content is added later,
it should use an allow-listed declarative schema (for example, explicit point,
curve, and label data) with strict validation; never execute code from a bank
and never plot a problem's requested unknown automatically. The current image
block remains a static referenced image, not an interactive graph.

## Compatibility and limits

- Legacy AST-backed Steps remain readable. Empty legacy `\\square` slots are
  translated to MathLive placeholders only in the editor view.
- Current MathLive edits keep exact LaTeX in `mathLatex`. The app attempts to
  parse that value into its legacy AST for compatible features; when an
  expression is outside that parser, the previous AST is retained. Therefore
  exact display/save/reload and the MathLive editing path are preserved, but
  AST-only consumers may not understand every MathLive command.
- The single-file offline build embeds MathLive fonts and static CSS. Its
  size limit is now 3 MB; the current generated fragment is checked by the
  production build.
- Tests use browser emulation and isolated fixtures. They do not constitute a
  real Android-device, screen-reader, or private Drive acceptance test.

## Primary references

- [MathLive](https://mathlive.io/)
- [MathLive React integration](https://mathlive.io/mathfield/guides/react/)
- [MathLive virtual keyboard](https://mathlive.io/mathfield/guides/virtual-keyboard/)
- [MathLive static rendering](https://mathlive.io/mathfield/guides/static/)
- [MathLive API reference](https://mathlive.io/mathfield/api/)
- [MathLive commands and selection](https://mathlive.io/mathfield/reference/commands/)
- [MathLive repository and MIT license](https://github.com/arnog/mathlive)
- [MathJax documentation](https://docs.mathjax.org/)
- [KaTeX supported functions](https://katex.org/docs/supported)
- [JSXGraph documentation](https://jsxgraph.org/docs/)
- [W3C bidirectional text guidance](https://www.w3.org/International/questions/qa-html-dir)
- [WCAG 2.2 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
- [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
