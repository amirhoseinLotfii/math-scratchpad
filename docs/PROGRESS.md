# Feature card progress

Source: `CODEX_SYNC_AND_FEATURES _1_.md`. Status is updated as a card is implemented, tested, and reviewed. Cards follow the order in Scope 21; a card is not marked done until its acceptance checks and required CI pass.

## P0 — foundation

| Card | Status | PR |
| --- | --- | --- |
| P0-1 Event model | todo — next in the roadmap | — |
| P0-2 Cloud source of truth + Worker | todo | — |
| P0-3 Browser outbox + safe migration | todo | — |
| P0-4 Drive mirror | todo | — |
| P0-5 Notion mirror | todo | — |
| P0-6 Sync status UI | todo | — |
| P0-7 Backup + restore | todo | — |

## P1 — learning

| Card | Status | PR |
| --- | --- | --- |
| P1-1 Mastery gating | todo | — |
| P1-2 Pre-lesson review | todo | — |
| P1-3 Active interleaved lesson flow | in progress — existing implementation is being completed against the new roadmap | [#26](https://github.com/amirhoseinLotfii/math-scratchpad/pull/26) |
| P1-4 Reliable answer checker | todo | — |
| P1-5 Heavy practice + «تمرین بیشتر» | in progress — v23 and tests are being added to PR #26 | [#26](https://github.com/amirhoseinLotfii/math-scratchpad/pull/26) |
| P1-6 Stepwise hints | todo | — |
| P1-7 Mistakes notebook | todo | — |
| P1-8 Spaced repetition | todo | — |
| P1-9 Mixed + cumulative review | in progress — tag-based selection and saved runs are being added to PR #26 | [#26](https://github.com/amirhoseinLotfii/math-scratchpad/pull/26) |
| P1-10 Daily goal + warnings + streak | todo | — |

## P2 — tracking

| Card | Status | PR |
| --- | --- | --- |
| P2-1 Confidence rating | todo | — |
| P2-2 Why after correct answer | todo | — |
| P2-3 Error categories | todo | — |
| P2-4 Mastery levels + decay | todo | — |
| P2-5 Distraction + active-time tracking | todo | — |
| P2-6 Time vs. own average | todo | — |
| P2-7 Full item history | todo | — |
| P2-8 Progress dashboard | todo | — |
| P2-9 Daily + Friday reports | todo | — |
| P2-10 Book coverage page | todo | — |
| P2-11 Graph answers + real figures | todo | — |
| P2-12 Lesson/chapter export | todo | — |

## P3 — polish

| Card | Status | PR |
| --- | --- | --- |
| P3-1 Session mood + energy | todo | — |
| P3-2 Concept map | todo | — |
| P3-3 Reverse questions | todo | — |
| P3-4 Timed practice | todo | — |
| P3-5 Offline PWA | todo | — |
| P3-6 Accessibility + shortcuts | todo | — |
| P3-7 Content cleanup | todo | — |

## Current validation

- PR #26 remains open and unmerged while the new roadmap is reconciled with its existing P1 work.
- v23 is generated locally from v22; it has not been uploaded to Google Drive.
- The local v23 build is deterministic: repeated `npm run bank:v23` runs produced SHA-256 `22f26ca1b2a4570dcc2b23ac58f5d69b238f3c1881e60d8e073673cd93951add`.
- Current code validation: `npm test` — 811 passed; `npm run typecheck` — passed; `npm run test:typecheck` — passed; `npm run build` — passed; `npm run test:e2e` — 449 passed, 59 skipped by the existing Playwright project matrix, 0 failed (33.5 minutes).
- Desktop/mobile mixed-review screenshots are captured under `test-results/browser-artifacts/lessons-mixed-review-*`; no generated screenshots are added to the source diff.
- The next roadmap card is P0-1 Event model. Its local-first event schema and emitters must be implemented before the later sync cards; P1 work remains isolated in PR #26 until the P0 foundation is delivered in the roadmap order.
- Safari/iOS device testing is still needed; Playwright used Chromium projects.
