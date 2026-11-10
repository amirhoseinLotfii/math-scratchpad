# Product audit 2 — 2026-11-10

## Scope and evidence

- Audited `fix/full-polish` at `bd4e8b3` before code changes. The requested interface contract is retained: English controls and Persian lesson/question prose.
- Used Codex's in-app browser and the repository's Playwright-managed Chromium. The Windows system browser was not used.
- Visually checked the notebook at 360, 390, 768, 1024, 1280, and 1440 CSS pixels. No horizontal overflow was observed at those widths. A 390 × 844 view leaves a large unused area below the primary action; short-height and landscape layouts still need their own review.
- Inspected the empty lesson picker, Drive bank panel, connected practice layout, and lesson content with Persian prose and inline math. No real Google account or selected bank file was used.
- `npm run build` passed, including TypeScript, Vite production build, standalone output, and the Cloudflare Worker dry run. Vite reported that `node:crypto` is externalized from `src/sync/legacy-migration.ts` for browser compatibility; the build completed.
- `npm run test:gate` passed typecheck, worker integration (95 tests), and unit/DOM coverage. The browser stage stopped on its first failure: 146 passed, 1 failed, 1 was interrupted, and 454 did not run. The failure was `e2e/lessons/phase5-a11y.spec.ts` on its `concept` view.
- The failed axe run found serious `color-contrast` violations: `#8c8c8c` text on `#404040`, ratio 3.08:1, where 4.5:1 is required. The nodes included example headings/labels, practice guidance, and the next-section hint.
- A focused mobile-390 run confirmed `mirror-status` also fails while opening `section[aria-labelledby="sync-panel-title"]`. A fresh Vite dev page reproduced the missing panel; the production preview opened it. The click handler exists in source, so the dev/production discrepancy still needs isolation. The remaining persistence specs were not conclusively assessed in this run.
- Lighthouse 12.8.2 on the local production preview, with mobile emulation and Playwright's Chromium: Performance 69, Accessibility 100, Best Practices 100; FCP 3.7 s, LCP 3.8 s, TBT 450 ms, CLS 0. The run flagged about 250 KiB of unused JavaScript. This is a local single-run baseline, not a live CDN or physical-device measurement. The high Lighthouse accessibility score does not supersede the axe failure in the lesson state.

## Findings

### P1 — Fix before calling the product ready

1. **Lesson text contrast falls below WCAG AA.** `src/styles/design-tokens.css:154,160` pairs the elevated surface `#404040` with muted text `#8c8c8c`; `src/styles/tokens.css:14` maps the legacy muted foreground to that token. Axe measured 3.08:1 in the lesson concept state. Keep border tokens separate from text tokens so raising text contrast does not weaken the existing border contrast.
2. **The sync-panel entry path differs between dev and production.** `src/app/exercise-menu.tsx:68` calls `onOpenSync`, and `src/App.tsx:656,661` set and render `syncPanelOpen`. The production preview visibly opens the panel, but fresh Vite dev did not, and the mobile `mirror-status` test then could not find the panel. Find the runtime cause before changing the test expectation.
3. **Mobile Lighthouse performance is below the requested 90 target.** The production-preview score was 69, with 3.8 s LCP and 450 ms TBT. Lighthouse attributed about 250 KiB of potential savings to unused JavaScript. Identify the actual heavy routes/modules before splitting code.

### P2 — Complete as part of this polish pass

1. **Only a dark palette is implemented.** `src/styles/tokens.css:2` forces `color-scheme: dark`, and `src/styles/design-tokens.css` defines the dark semantic palette. The requested light theme, theme control, and preference persistence are absent.
2. **Design tokens and responsive rules have multiple sources.** `src/main.tsx:12-13` imports both token files, while `src/styles/globals.css:2-3` imports them again. `globals.css:5-13` contains self-referential `@theme inline` mappings, and `src/styles.css` uses several competing breakpoints (including 359, 479, 480, 599, 600, 768, 899, 900, 1100, and 1600 px).
3. **Large files and root-level modules make changes harder to review.** `src/features/lessons/lesson-screen.tsx` is 824 lines and `src/App.tsx` is 740 lines. Several older app modules and re-export shims still sit directly under `src/`; inventory consumers before moving or removing any of them.
4. **Two bank exercise modes are missing from the renderer contract.** `src/sync/events.ts:19` accepts `true_false_why`, `find_mistake`, `explain`, and `reverse` as event item types, but `src/features/drive-bank/drive-bank.ts:16,91-92,247` accepts only `math`, `text`, and `choice` for bank questions and maps those three into the app. Implement the requested two modes without answer keys; decide and document the status of `explain` and `reverse`.
5. **Visual test outputs target a tracked cleanup folder.** The lesson visual tests write to `artifacts/lessons/`, and `MANIFEST.sha256` contains those files. Removing `artifacts/` therefore also requires redirecting test output and regenerating the manifest. The named scripts/reports must be checked for runtime references before cleanup.
6. **Section skip events are incomplete.** `docs/EVENTS.md:34` and `src/features/lessons/lesson-screen.tsx:519,580` describe skips unlocking the next section; `gate_failed` is already accepted by the event schema but remains reserved. Log a skip explicitly without blocking navigation.

## Not verified in this audit pass

- Real-account Google sign-in after refresh/new tab, silent token refresh, session revocation, Picker-selected bank read, and Drive/Notion mirror delivery.
- Actual Cloudflare Worker deployment state and credentials; no deployment was attempted.
- Physical iOS/Android devices, landscape phone/tablet, 200% zoom, NVDA/VoiceOver, and real screen-reader navigation.
- All browser states and all breakpoint/theme combinations. The current product has no light theme to inspect, and the initial browser gate stopped before the remaining 454 browser cases.

## Fix order

1. Restore text contrast and reproduce the dev sync-panel discrepancy with a focused browser test.
2. Unify tokens and responsive breakpoints, then add the light theme and persisted choice.
3. Implement the two requested answer modes and settle `explain`/`reverse` without adding or inferring bank answers.
4. Split the lesson UI and move modules only after checking every importer.
5. Repair the pre-existing persistence E2E failures, route generated screenshots to ignored test output, and clean the named files.
6. Complete event coverage, Worker deployment documentation, visual/Lighthouse checks, and manual-test notes.
