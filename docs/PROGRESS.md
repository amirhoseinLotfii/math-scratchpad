# Feature card progress

Build order follows `CODEX_SYNC_AND_FEATURES _1_.md` Scope 21. A card is complete only after its tests, CI, deploy, live check, Persian changelog entry, and merge. A green feature PR that depends on a later foundation stays open until that foundation is merged.

| Card | Status | PR / evidence |
| --- | --- | --- |
| P0-1 Event model | in progress | `feat/p0-1-learn-events`; PR #27 open; latest hosted CI still fails WIDE-08 focus restoration |
| P0-2 Durable Object + Worker | todo | — |
| P0-3 Browser outbox + migration | todo | — |
| P0-4 Drive mirror | todo | — |
| P0-5 Notion mirror | todo | — |
| P0-6 Sync status UI | todo | — |
| P0-7 Backup and restore | todo | — |
| P1-1 Mastery gating | todo | — |
| P1-2 Pre-lesson review | todo | — |
| P1-3 Active interleaved lesson flow | in progress | [PR #26](https://github.com/amirhoseinLotfii/math-scratchpad/pull/26), CI green; held unmerged until P0 foundations |
| P1-4 Reliable answer checker | todo | — |
| P1-5 Heavy practice | in progress | [PR #26](https://github.com/amirhoseinLotfii/math-scratchpad/pull/26), CI green; held unmerged until P0 foundations |
| P1-6 Stepwise hints | todo | — |
| P1-7 Mistakes notebook | todo | — |
| P1-8 Spaced repetition | todo | — |
| P1-9 Mixed and cumulative review | in progress | [PR #26](https://github.com/amirhoseinLotfii/math-scratchpad/pull/26), CI green; held unmerged until P0 foundations |
| P1-10 Daily goal and streak | todo | — |
| P2-1 Confidence rating | todo | — |
| P2-2 Why after a correct answer | todo | — |
| P2-3 Error categories | todo | — |
| P2-4 Mastery levels and decay | todo | — |
| P2-5 Distraction and active-time tracking | todo | — |
| P2-6 Time vs. own average | todo | — |
| P2-7 Full item history | todo | — |
| P2-8 Progress dashboard | todo | — |
| P2-9 Daily and Friday reports | todo | — |
| P2-10 Book coverage page | todo | — |
| P2-11 Graph answers and figures | todo | — |
| P2-12 Lesson/chapter export and coach copy | todo | — |
| P3-1 Session mood/energy | todo | — |
| P3-2 Concept map | todo | — |
| P3-3 Reverse questions | todo | — |
| P3-4 Timed practice | todo | — |
| P3-5 Offline PWA | todo | — |
| P3-6 Accessibility and shortcuts | todo | — |
| P3-7 Content cleanup | todo | — |

## Persian changelog

- P0-1: رویدادهای یادگیریِ اعتبارسنجی‌شده و تغییرناپذیر اضافه شد. زمان فعالِ جلسه، درس، تکهٔ صفحه‌ای، سکشن، سؤال و گام با کنارگذاشتن زمان بیکاری، تب پس‌زمینه و توقف دستی ثبت می‌شود. پاسخ‌ها فقط پس از تلاش ثبت می‌شوند و نتیجهٔ درست/نادرست فقط از checker معتبر می‌آید. پس از شکست ناپایدار فوکوس در CI، بازگردانی فوکوس MathLive به‌روزرسانی شد تا ورودی زندهٔ همان گام را پیدا کند و در چند فریم دوباره تلاش کند. رویدادها هنوز در حافظه‌اند؛ ذخیرهٔ پایدار در کارت P0-3 اضافه می‌شود.

## P0-1 test notes

- The event API is in-memory at this stage. Durable offline persistence belongs to P0-3.
- Timed scopes cover session, lesson, page-based concept chunk, section, question and the focused MathLive step; focus/visibility/idle time is shared.
- Initial full local gate: 444 passed, 52 viewport-conditional skips in the 496-test Playwright matrix; `src/sync` line coverage 93.21% (before final focus/test-infrastructure adjustments).
- `npm run build`, `npm run typecheck`, `npm run test:typecheck`, targeted unit/integration tests and the event E2E passed.
- WIDE-08 passed 20 consecutive runs across 1024px and 1440px after the prior focus adjustment and 20 consecutive 1440px runs after the latest retry change; both TypeScript checks passed again.
- Latest hosted CI run `41366840960` failed WIDE-08 at 1440px after its single retry; the new live-field/frame retry fix is pushed for another CI run before merge or deploy.
- CI runs the full Playwright matrix with one worker and one retry for transient focus flakes on constrained hosted runners; repeated failures still block the gate. Local runs retain two workers. Push CI is limited to `main`; feature branches are validated by their PR run.
- «نیاز به تست»: Safari/iOS visibility and focus behavior on a physical device.
