# Changelog

## 0.5.0 — 2026-10-25

### Added
- Thirty no-hint Persian-stem fraction diagnostic questions displayed as LTR mathematical expressions.
- Exact rational (BigInt) diagnostic feedback separating numerical correctness, required form and equality-chain consistency.
- Keyboard-driven insertion chooser, horizontal same-level and vertical fraction navigation.
- Per-question progress retained while using Previous / Next Problem.

### Changed
- Responsive desktop notebook and optional side keyboard with full-width collapsed state.
- UI remains English and LTR; only the question statement uses Persian RTL.
- Keyboard stays closed by default, with best-effort stored preference.

### Fixed
- Structural Delete/Backspace and undo/redo shortcuts independent of keyboard visibility.
- Session metadata validation for the expanded 30-question bank.
- Old tests that assumed the keyboard was nested inside each step.

### Limitations
- Automated diagnostic feedback is provisional, not a substitute for manual review.
- Physical device keyboard and accessibility testing is still required.
- Cross-conversation updates are not possible with the embedded-chat edition.



## 0.4.0 — 2026-10-23

### Changed

- Start numeric keys at the top-left with 1–3 and place Backspace beside quick templates at the top-right.

- Match the gallery direction with a charcoal/forest-green shell, mint highlights, rounded step cards and more readable numeric keys.
- Render original problems as read-only math using the existing formula renderer.
- Show topic-specific template previews alongside symbol rows, plus favorites and recent symbols.
- Add genuine Edited badges, clearer whole-structure actions and explicit session-backup guidance.
- Use product-container breakpoints for stacked mobile layouts without assuming the width of the ChatGPT viewport.

### Fixed

- New steps and final-answer flag changes no longer incorrectly mark later math as needing review.
- Session restore preserves real edit markers; previews cannot change the editing selection.

### Validation

- 29 automated tests and production build pass. Android visual/touch checks are still pending; image-perfect matching is not claimed.

## 0.3.0 — 2026-10-23

### Added

- React/TypeScript implementation with Redux Toolkit, typed hooks and bounded document history.
- Compact/full math keyboard, structural Next and full-structure clipboard actions.
- New problem from current expression, recent/favorite symbol controls.
- Successful-copy snapshots and changed-since-copy status.
- Versioned session persistence and legacy import, automated tests and build tooling.

### Preserved

- Direct LTR editing, ASCII digits, vertical fractions and main-line insertion beside fractions.
- Ordered independent steps, explicit final-answer selection and downstream review markers.
- Check copies a complete review prompt for manual pasting and sending in the conversation.

### Known limitations

- No local solver, graphing or direct ChatGPT message sending.
- Partial LaTeX importer; advanced templates transfer losslessly through JSON sessions.
- Physical Android and screen-reader checks remain pending.
