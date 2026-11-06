# Math Scratchpad — Pre-use release verification (2026-11-06)

## Deployment and scope
- Baseline production/main: `98ee26ff79cd549841e4335df0cef87feece7316` (PR #65); GitHub Pages run [42283417098](https://github.com/amirhoseinLotfii/math-scratchpad/actions/runs/42283417098) succeeded.
- Source of this incremental patch: a reproduced **P1 immediate first-typing race** in newly started diagnostic practice.
- Testing was performed with isolated browser contexts; no authenticated Google Drive or Notion data was changed.

## Confirmed bug (P1): first physical math typing can disappear
**Reproduction before fix:** On the production site, start a 30-question diagnostic, select `Skip for now`, immediately click the Step 1 mathfield and type `7139`. In a fresh 390px Chromium session, the document body temporarily remains focused and the mathfield still displays an empty placeholder. Waiting 100ms before typing avoids the bug. The app's on-screen numeric keypad also works.

**Root cause:** The MathLive custom element and its internal focus surface can finish connecting after the first pointer interaction. Keystrokes reach the document body during this initial focus gap rather than the editor.

**Correction:** `src/features/math-editor/components/mathlive-step-input.tsx` now tracks only an intentionally clicked mathfield and temporarily captures supported math keystrokes while the body is focused, replaying them through the existing MathLive adapter as soon as it is ready. Document-level listeners are detached on unmount and the capture is cancelled on an outside pointer interaction. No persistence or grading logic is modified.

**Regression:** `e2e/mathlive-first-keystroke.spec.ts` and `e2e/wide/mathlive-first-keystroke.spec.ts` test typing immediately after onboarding and verify its value without an artificial focus wait, including reload persistence in the mobile test.

## Verified tests before this pull request
- Exact 9 immediate typing trials, three each at 320px, 390px and 1440px: **9/9 PASS**.
- New Chromium Playwright regressions at 320, 390, 430, 1024, 1440, 1920, 2560: **7/7 PASS**.
- Existing MathLive, mobile accessibility, keyboard and responsive lessons browser suites: **94/94 PASS**.
- Unit tests: **286/286 PASS**.
- UX: **43/43 PASS**; a11y: **34/34 PASS**; integration: **169/169 PASS**; wide: **42/42 PASS**; architecture: **5/5 PASS**.
- `npm run typecheck`, test TypeScript compilation and `npm run build`: **PASS**.
- Production smoke checks (separate from this patch): 320/390/430/768/1440/1920 viewport load and menu hit targets, New Problem focus, no document horizontal overflow and no JavaScript exceptions; all tested cases passed.
- 20- and 30-question exercise start, required confidence validation and navigation to question two tested; correct question transition was confirmed in the mobile selector as well as desktop headings.
- Sync dialog generated downloadable JSON files at 320, 390 and 1440 viewport widths without a JavaScript exception.
- Editing a step, marking Step 2 Final and reloading preserved the rendered math and selected Final step in controlled browser contexts.

## Remaining risks / not verified
- **Account-authorized Google Drive and Notion Sync**, conflict recovery and cross-device continuity **not verified**; do not rely on them as sole backup.
- **Physical Android TalkBack, iOS VoiceOver, Safari and Firefox** not directly verified in this final production smoke. A MathLive inner accessible label can temporarily lag behind an edited expression; its screen-reader behavior needs physical validation before claiming full accessibility.
- Full 20/30-question mathematical grading for *every answer type* has not been manually exercised; existing unit/integration coverage is substantial but not a formal proof of no bugs.
- UX design follow-ups from the earlier audit remain open: large Sync-status area on narrow phones, menu organization, end-session feedback and split-pane scrolling.

## Release decision
The confirmed input-loss bug is important to fix before daily study. Merge/publish **only after the new PR CI gate passes**; verify GitHub Pages deploy success separately, then run a quick production typing test. Passing CI and smoke checks does not guarantee all possible devices and states are bug-free.