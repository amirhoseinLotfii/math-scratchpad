# Book Bank Run Notes

## Run start — 2026-11-13 21:41 Asia/Tehran

- Created RUN_ID `20261113-2141` after Drive search found no `Math Scratchpad Book Banks` run folder and GitHub search found no `booklog/*` branch.
- Confirmed Google Drive is connected to the user's personal account. GitHub, Notion read access, and Cloudflare identity are available. No credentials were requested or copied.
- PR #94 remains open and draft. Per D4, content work proceeds; no code branch or production change is made while it is open.
- Main is `7eeeef0bf7d524323f88e3520484dfd3a0f7a7bf`. Existing scratch checkouts were on the audit fix branch; one had unrelated local modifications. They were left untouched. A separate clean `main` clone was created.
- Created a private Drive run folder with `banks/`, `answer-keys/`, `reports/`, and `source-extracts/` subfolders. No sharing changes were made.
- Environment: `npm ci` completed successfully (271 packages); Node 24.22.1, npm 11.9.0, Python 3.12.14, SymPy 1.14.0, pypdf 6.21.4, pdfplumber 0.11.9, PyMuPDF 1.26.6, Chromium, `pdftotext`, and Tesseract are available. OpenStax section HTTP request returned 200.
- Re-read the Notion core plan. It identifies chapters 1, 2, 3, 4, 9, and 11 as the original core (43 sections). This run follows the newer explicit D1 scope and order for chapters 2–12. The Notion page was not modified.
- Read the current AI Path Coach instructions, AI Engineer roadmap, research notes, goal interview, daily plan, math resume, learning summary, and the Math Scratchpad lesson-feature handoff. No session/attempt exports, sync folder, answer data, or device state was edited.

## Phase 0 — 2026-11-13 21:52 Asia/Tehran

- Verified `main` code: `BANK_SCHEMA = math-scratchpad.bank/1.0`; `MAX_QUESTIONS_PER_BANK = 1000`; `parseBankText` rejects over 1,000,000 UTF-16 code units; `parseLessons` parses concept/section references; lesson blocks are capped at 100.
- Downloaded the active Chapter 1 v21 bank and private 1.1 answer key to local scratch for read-only template analysis. The bank was not edited, and no answer values were copied to Git or the new bank folder.
- Template analysis: 1,183,848 UTF-8 bytes / 900,559 UTF-16 code units; 8 lessons, 50 concepts, 708 questions (85 L, 493 X, 80 R, 35 T plus 15 generated items); 39 simple-idea notes; 124 examples whose title/text marks them supplementary; 207 unique image sources across 210 image blocks.
- Section question references are complete: 708 references, 0 missing, 0 duplicate, 0 unreferenced. The 85 concept check references are a separate expected layer and are not section duplicates.
- `TEMPLATE-STATS.md` and `analyze-template.mjs` are stored in Drive `reports/` and `reports/tooling/`, and on the orphan notes-only branch. No bank content, book text, or answer key is in Git.

## Decisions

- Preserve Chapter 1 v21 as read-only. Keep all future bank content, source text, and answer keys out of public Git.
- Use actual repository code and the live v21 bank as the authorities when they differ from the handoff's measured facts.
- Use no existing `fix/*` checkout for this run. The current PR #94 stays untouched until it merges; code work remains deferred under D4.
