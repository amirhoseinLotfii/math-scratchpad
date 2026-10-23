# Changelog

## 0.4.0 — 2026-10-23

### Changed

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
