# Mobile stack and boundaries — implemented phone-first architecture

Production now uses React/strict TypeScript, a Zustand vanilla store, RHF/Zod forms and source-owned Radix-backed UI components. The existing pure editing engine is retained through a typed action adapter so established regression tests continue to exercise the same mathematical behaviors.

## Libraries and responsibilities

| Responsibility | Target | Boundary |
|---|---|---|
| UI/runtime | React + strict TypeScript + Vite | Semantic HTML first; phone design first |
| Session state | Zustand vanilla store + narrow React selectors | Mathematical tree, cursor, question, ordered steps, scoped history |
| Durable storage | Zustand store + custom validated persistence adapter | Zod validation, explicit version/migration, write failures, storage-event synchronization |
| Forms | React Hook Form + @hookform/resolvers + Zod | Confidence, new problem, JSON import; draft form values commit only on valid submit |
| Components | shadcn/ui, Radix-backed Dialog/DropdownMenu; native form radios | Source-owned components, labelled controls, portal focus/inert behavior tested end to end |
| Styling | Tailwind CSS + semantic CSS variables | background/foreground, primary/on-primary, muted, border, ring, destructive, spacing/radius/type tokens |
| Variants/icons | class-variance-authority, clsx, tailwind-merge, lucide-react as needed | Consistent variants; icons decorative within named buttons |
| Tests | Vitest, Testing Library, user-event, jest-dom | Behavior and validation in DOM; no layout claims from JSDOM |
| Real-browser A11Y/UX | Playwright + @axe-core/playwright | Actual contrast, keyboard, clipping, resize, portal dialogs, storage/tab behavior |
| Generated inputs | fast-check | Fixed seed, shrinking, reproducible counterexamples, model/tree and roundtrip invariants |

Compatible installed versions are recorded in package-lock.json. No Next.js/server/backend is required for this local-first editor.

shadcn is copied component source, not an automatic accessibility certification. Use its primitives correctly and test the composed app. The app remains English; only question prose is Persian `lang=fa dir=rtl`, with math isolated LTR. Native OS status bars are outside the web viewport and must not be faked inside the app.

## Production folders and migration boundaries

- `src/app/`: App, providers, startup/hydration, application boundary.
- `src/features/math-editor/`: `components/`, `model/`, `store/`, `schemas/`, public `index.ts`.
- `src/features/session/`: question navigation, confidence/completion, import/export, `persistence/`, sync handling.
- `src/features/assessment/`: existing pure assessment logic and question banks; expected answers never enter student exports.
- `src/shared/ui/`: shadcn primitives; no math/session domain state.
- `src/shared/lib/`: clipboard/typed result helpers; no feature-to-feature dependency cycles.
- `src/styles/`: `tokens.css`, `globals.css`, motion/forced-colors and typography.
- `tests/unit/`, `tests/integration/`, `tests/accessibility/`, `tests/ux/`, `tests/properties/`, `tests/support/`.
- `e2e/accessibility/`, `e2e/persistence/`, `e2e/visual/`, `e2e/support/`.

Use kebab-case files/folders, PascalCase React exports, `use-*.ts` hooks and explicit public exports. Keep domain logic independent from React, form and component libraries. No duplicate session truth in RHF and Zustand: RHF holds the pending decision, Zustand holds committed session state. Do not use RHF to represent every math token or every cursor movement.

New React behavior tests go through `tests/support/render-mobile-app.tsx`. It mounts the actual Zustand provider. Low-level store tests use the typed Zustand/engine adapter with the established behavioral assertions. Redux runtime dependencies have been removed. Legacy root model/store/parser paths remain compatibility exports; App and the existing assessment bank are still at the root, so the feature-folder migration is intentionally partial.

## Persistence and sync contract

Primary key: `math-scratchpad-session-v3`. Validate a version-3 envelope before hydration. The browser tests expect `{version:3,state:{session:{doc,prefs},sync:{revision,writerId}}}`. Runtime state/actions, open dialogs, pending form choices, internal clipboard and Undo arrays are excluded. Revisions identify logical changes; elapsed-time saves must not cause incoming events to bounce between tabs.

Migrate legacy `math-scratchpad-redux-v2` and `math-scratchpad-flow-v1` without deleting the original backup on initial migration. A malformed/future-version primary draft is preserved until explicit recovery; startup timers must not overwrite it. Import/export remains a separately validated portable session format; persistence envelopes must not leak into student review unexpectedly.

Same-origin clean tabs can hydrate newer valid drafts. Dirty local work must not be overwritten silently; show an English Draft conflict dialog with Keep this tab / Use saved draft and explicit focus handling. Invalid/stale/replayed remote envelopes are ignored/reported, not installed. Listeners detach on disposal. Do not broadcast an unchanged incoming state back to storage. Manual export remains usable on quota/security failure.

localStorage sync works only within the same browser profile and origin. Cross-device/cloud sync requires an additional authenticated service and is outside the present scope.

## Design-system rules under test

Semantic tokens, capped text width, stable icon hit areas, visible focus, real native disabled behavior, responsive keypad reflow, optional reduced motion, forced-colors support and readable English/Persian fonts. No global color overrides on unrelated host content. Keep safe-area padding and mobile dynamic-height handling in layout, not device-name detection.

Confidence is absent from mobile edit view. Submit/Next opens a labelled dialog. Its Continue remains usable to reveal an actionable required-field error; invalid submit focuses the first radio, links an English error and does not navigate. Cancel/Escape discards draft choice and restores invoking focus. Skipped questions do not invent confidence. On completion, copying always requires an explicit action.

## Primary references

- https://ui.shadcn.com/docs/forms/react-hook-form
- https://ui.shadcn.com/docs/theming
- https://react-hook-form.com/advanced-usage
- https://zustand.docs.pmnd.rs/reference/middlewares/persist
- https://playwright.dev/docs/accessibility-testing
- https://www.w3.org/WAI/WCAG22/Understanding/
