# Logic Bug Register

## BUG-001
- **TITLE:** Reading Position TypeScript / API contract broken
- **MODULE:** `src/features/progress/*`
- **SEVERITY:** P0
- **STATUS:** VERIFIED FIXED (cherry-pick `3cb1bf5` → `932e894`)
- **ROOT CAUSE:** `trackPosition` bound to `setPosition`; storage `getPosition` sync vs async mismatch; SyncMessage nullability inconsistent
- **REGRESSION:** `npm run typecheck`, `npm run test:typecheck`

## BUG-002
- **TITLE:** Architecture kebab-case exceptions for Reading Position files
- **MODULE:** progress feature filenames
- **SEVERITY:** P2
- **STATUS:** VERIFIED FIXED
- **ROOT CAUSE:** PascalCase filenames added under `src/features` with temporary exceptions
- **FIX:** rename to `reading-position-context.tsx`, `restore-position.tsx`; clear exceptions
- **REGRESSION:** `npm run test:architecture`

## BUG-003
- **TITLE:** RestorePosition observes anchors that lesson renderer never emits
- **MODULE:** lessons + progress
- **SEVERITY:** P1
- **STATUS:** PARTIAL — anchors added; RestorePosition not yet wired into lesson screen
- **ROOT CAUSE:** `data-anchor-id` missing on section/concept DOM
- **FIX:** `sectionAnchorId` / `conceptAnchorId` on lesson section/concept nodes
- **REGRESSION:** `tests/unit/reading-position-anchors.test.ts`

## BUG-004
- **TITLE:** Invalid IntersectionObserver rootMargin
- **MODULE:** `restore-position.tsx`
- **SEVERITY:** P2
- **STATUS:** VERIFIED FIXED (code); browser evidence pending
- **ROOT CAUSE:** `rootMargin: '0 -50% 0 0'` lacks required CSS units
- **FIX:** `rootMargin: '0px 0px -45% 0px'`

## BUG-005
- **TITLE:** Continue Learning has no navigation / not rendered
- **MODULE:** `ContinueLearningButton`
- **SEVERITY:** P1
- **STATUS:** OPEN
- **NEXT:** wire click → lesson route; render in resume surface; persist via existing learning storage

## BUG-006
- **TITLE:** last-open-lesson key excluded from server sync allowlist
- **MODULE:** `src/sync/browser-db.ts`
- **SEVERITY:** P1
- **STATUS:** VERIFIED FIXED (unit)
- **ROOT CAUSE:** `isLearningStorageKey` only allowed session keys + lesson-progress prefix
- **FIX:** allow `math-scratchpad-last-open-lesson-v1:` and `math-scratchpad-reading-position-v1:`
- **REGRESSION:** `tests/unit/learning-storage-keys.test.ts`

## BUG-007
- **TITLE:** Reading position never updated from live lesson navigation
- **MODULE:** `lesson-screen.tsx`
- **SEVERITY:** P1
- **STATUS:** PARTIAL — section changes now call `trackPosition`; RestorePosition wrapper still pending
- **FIX:** track chapter/lesson/section + contentAnchorId on section change

## BUG-008
- **TITLE:** Reading position used parallel IndexedDB + localStorage instead of server learning state
- **MODULE:** `reading-position-store.ts`
- **SEVERITY:** P0/P1
- **STATUS:** VERIFIED FIXED (unit)
- **ROOT CAUSE:** Separate IndexedDB + zustand persist; not allowlisted server path; not driven by latest learn event
- **FIX:** Persist via `math-scratchpad-reading-position-v1` learning storage; update from latest location learn event; last-timestamp wins
- **REGRESSION:** `tests/unit/reading-position-from-event.test.ts`
