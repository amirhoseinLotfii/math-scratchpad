# Session Handoff — 2026-11-08

## Branch
`audit/qa-continuous-2026-11-08` (from `fix/mathlive-practice-google-login` @ `9b8693c`)

## Baseline (this machine)
| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run test:typecheck` | PASS |
| `npm run test:unit` | PASS 289 |
| `npm run test:a11y` | PASS 34 |
| `npm run test:architecture` | PASS 5 |
| `lesson-split-view` | PASS 4 |
| Playwright / device matrix | NOT RUN yet |

## Research vs current HEAD
Research doc was based on `b7215e3`. On current branch many P0 items are already fixed:
- `SPLIT_MEDIA_QUERY` is numeric `(min-width: 1100px)`
- No `var()` in `@media`/`@container` conditions found
- Architecture PascalCase debt was exception-listed; renamed in this session
- CI TypeScript unblock cherry-picked from `main` (`3cb1bf5` → `932e894`)

## Done this session
1. Preserved WIP reading-position stash, then replaced with main’s typed fix (no fake incomplete API).
2. Cherry-picked CI unblock (Playwright describe, Reading Position types, gate-runner).
3. Renamed `ReadingPositionContext.tsx` / `RestorePosition.tsx` → kebab-case; removed architecture exceptions.
4. Added semantic `data-anchor-id` on lesson section/concept nodes.
5. Fixed invalid IntersectionObserver `rootMargin` in restore-position.
6. Added unit tests for anchor id helpers.

## Preserved local WIP
Earlier incomplete WIP used `userId: 'default-user'` everywhere. Discarded in favor of main’s `trackPosition` upsert. Do not re-apply that stash pattern.

## Reading position → server (this turn)
- Source of truth: latest location learn event (timestamp wins).
- Persist key: `math-scratchpad-reading-position-v1` via `getLearningStorage()` → authenticated `/state`.
- Removed parallel IndexedDB + zustand persist path.
- Provider starts `startReadingPositionPersistence()` (event + storage listeners).

## Next (priority order)
1. Wire `RestorePosition` into `lesson-screen` without fighting lesson-progress restore.
2. Give `ContinueLearningButton` a real navigation handler and render it where resume belongs.
3. Run Playwright keyboard placement suites + capture evidence.
4. Full journey E2E: open lesson → example → keyboard → save → refresh → restore.

## Known remaining P1
- Reading Position is still not cross-device (BroadcastChannel/localStorage only).
- `ContinueLearningButton` has no `onClick` and is not rendered in App.
- `last-open-lesson` key is outside learning-storage allowlist (research §5.3.2).
