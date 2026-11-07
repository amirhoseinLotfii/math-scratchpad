# Math Scratchpad — Final-mile UX hardening (2026-11-07)

## Scope and baseline

- Base production revision: `dd2070da2d38217d1445c92c4bd6fe47c364ed45`.
- Existing [PR #66](https://github.com/amirhoseinLotfii/math-scratchpad/pull/66) (first MathLive keystroke loss) is on main; both its full CI and Pages workflow succeeded.
- Goal: reduce mobile auth-status obstruction and communicate unfinished work honestly at the end of 20/30-question practice, without breaking Google sign-in, local-first editing, the sync inspector, or session recovery.

## Fixed UX-06: oversized local connection notice (P2)

The unauthenticated connection card repeated two separate explanations about local storage and stacked a retry button beneath the title. Actual published-vs-local controlled browser measurements:

| Viewport | Before (live) | After (local candidate) | Saved vertical space |
| --- | ---: | ---: | ---: |
| 320 × 568 | 303 px | 194 px | 109 px |
| 390 × 844 | 263 px | 165 px | 98 px |
| 1440 × 900 | 263 px | 165 px | 98 px |

Changes: remove duplicate guidance, use one compact header row containing the same storage status and an accessible **Check connection** button with its existing full Persian accessible name, keep the full server error/message paragraph, and preserve the actual **Sign in with Google** control in normal page flow. All tested retry buttons remain 44 px tall. The card must never be fixed over a learning UI or a modal.

**Evidence:** six isolated browser screenshots of the before/after banner at these viewport widths. This is a visual/interaction optimization, not a change to token, server, or Google sign-in logic.

## Fixed UX-10: ambiguous completion feedback (P2)

Previously the **Session complete** dialog only stated that work was saved, even after finishing a batch with zero answers. The dialog now reports:
- `answeredQuestions` out of the current session's `totalQuestions`,
- `skippedQuestions` (when nonzero),
- `not answered (unverified)` for remaining questions.

An additional mixed-status check identified a real reporting ambiguity: saved drafts were previously counted as untouched. The summary now distinguishes drafts from truly unstarted questions. Example: **0 answered · 1 draft · 1 skipped · 18 not answered (unverified)** in a 20-question batch. No fake grading outcome or automatic correctness claim is produced. **Finish & Analyze**, **Copy full session JSON**, **Check · Copy for Review**, and **Close** keep their existing behavior. Example: a 20-question batch with no solved answers explicitly reports **0 of 20 questions answered · 20 not answered (unverified)**.

## Regression validation

- TypeScript app and test declarations: **PASS**.
- Existing suites: **286 unit**, **43 UX**, **34 accessibility**, **169 integration**, **42 responsive/wide**, **5 architecture** = **579 passing checks**.
- Production build: **PASS**.
- Focused Chromium E2E: **15/15 PASS**, including simulated Google sign-in and offline/online reconnection (`server-first.spec.ts`), sync modal backup button, New Problem focus, and both newly added scenarios.
- Real browser checked at 320/390/1440 px with Google iframe visible in the tested state and no site-wide horizontal overflow.
- Note: the full GitHub Actions gate is still required and must pass on the PR. Deployment must be checked separately and a production smoke test repeated after publishing.

## New/updated source files

- `src/sync/server-connection-gate.tsx`
- `src/styles.css`
- `src/features/session/components/completion-dialog.tsx`
- `src/App.tsx`
- `e2e/mobile-release-readiness.spec.ts` (new)
- `e2e/wide/connection-gate-compact.spec.ts` (new)

## Known limits and unresolved improvements

- An unauthenticated/offline test cannot prove real Google Drive/Notion account synchronization or conflict resolution. Simulated sign-in, offline editing and reconnect were tested; **live connected-account sync still requires explicit verification**.
- Browser-only testing cannot guarantee real TalkBack/VoiceOver or touch-keyboard behavior on every physical phone.
- Long advanced Exercise menu, split-pane scroll complexity and a potential MathLive screen-reader spoken-label lag remain separate UX review items; this patch does not claim those are solved.
- A green build or published Pages site is not a guarantee of zero bugs. Use a local exported/copied JSON backup for important study sessions until actual cloud recovery is independently verified.
