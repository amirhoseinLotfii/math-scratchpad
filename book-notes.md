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


## Phase 1 checkpoint — 2026-11-13 22:22 Asia/Tehran

- Implemented `scripts/book/validate-bank.ts`, importing the app’s actual `parseBankText`, `validateBank`, and `parseLessons`; `scripts/book/run-validator.mjs` loads it through Vite SSR because this checkout does not install `vite-node`.
- Read-only v21 audit: actual app parse verified; 0 `parseBankText` warnings and 0 `parseLessons` warnings; audit exit 0. The sole top-level warning is the expected 1,183,848-byte Chapter 1 file exceeding the new-bank target; template mode does not fail on known v21 defects.
- `CH1-FINDINGS.md` lists D-a…D-o results and explicit NOT_TESTED source/key checks. The full JSON contains counts and item identifiers only; no question text or answer values.
- Rechecked PR #94: still `OPEN` and draft. Base unchanged; current head is `94a47eb6b06502ecc45359839eb83c634aff2546`. No changes were made to the PR or app code.
- OpenStax’s official Preface was checked. It has a restriction requiring prior written permission before book material is ingested into LLM/generative-AI offerings. This is a material blocker for the requested AI-mediated full-book extraction/translation. No new web/PDF book pages were downloaded, no Chapter 2–12 content was produced, and G3 remains NOT_TESTED. See `reports/LICENSE-GATE.md`.
- The license point is recorded as a blocker for review, not as legal advice. Do not continue source extraction/content generation until the owner confirms written permission or changes scope to original, non-book-derived exercises.


## Repository-content checkpoint — 2026-11-13 22:28 Asia/Tehran

- Rechecked PR #94: still open and draft; current head `94a47eb6b06502ecc45359839eb83c634aff2546`.
- Current `booklog/20261113-2141` tree has 10 paths and contains notes, aggregate findings, the template analyzer, and progress only; no bank JSON, answer-key, source-extract, or question/answer text file.
- `gitleaks` is unavailable. A scoped credential-pattern scan of the new progress, notes, reports, and local tooling had no matches; G15 remains `NOT_TESTED` because the full history secret scan was not run.
- Content phases remain paused pending permission review; no source page extraction or new chapter bank content was produced.


## Owner license instruction — 2026-11-13 22:30 Asia/Tehran

- The official Preface contains an AI-ingestion restriction (source URL is recorded in `LICENSE-GATE.md`). The owner states that if the full sentence cannot be quoted verbatim, proceed using CC BY-NC-SA 4.0.
- Follow the owner’s scope instruction: continue Phase 1 and content phases; all banks, extracts, and answer keys remain in private Drive; each bank carries OpenStax attribution and CC BY-NC-SA 4.0.
- Do not represent the owner’s instruction as a written permission letter from OpenStax.


## Resume 2026-11-13 23:13 Asia/Tehran

- Followed the owner’s instruction to continue under the stated private, non-commercial CC BY-NC-SA 4.0 project scope. The official Preface source URL and AI-use restriction remain recorded in `reports/LICENSE-GATE.md`; this note does not claim OpenStax permission.
- Downloaded the three owner-supplied Drive PDF slices read-only to local scratch. They total 1,411 pages and their SHA-256 values match the run manifest. The separate 1,156-page public PDF asset was excluded because its pagination differs.
- Replaced the stale chapter-2 PDF extractor with one that reads the owner’s actual three slices and preserves absolute PDF page numbers. Added web extraction for separate Practice Test pages, including PDF page ranges.
- Corrected the official 9.8 web slug to `9-8-solving-systems-with-cramers-rule`; the prior misspelling returned HTTP 404. Normalized the singular category label `Extension` to `Extensions`.
- Added `verify-toc-pdf.py`; it ran successfully: 12 chapter starts, 73 section starts, 12 review starts, 12 Practice Test starts, 1,411 source pages, 0 mismatches.


## Phase 1 completion and Phase 2 plan checkpoint — 2026-11-13 23:44 Asia/Tehran

- Supersedes the earlier 22:22/22:28 pause notes: after the owner explicitly directed continuation under a private, non-commercial CC BY-NC-SA 4.0 scope, the source extraction proceeded. The owner’s instruction is recorded; this is not an OpenStax permission letter.
- Used the three owner-provided Drive PDF parts as the authoritative source. Together they contain 1,411 pages; their checksums are in `reports/BOOK-TOC.md`. A separate public PDF asset with 1,156 pages was excluded because its pagination differed.
- PDF TOC verification passed: 12 chapter starts, 73 section starts, 12 review headings, and 12 Practice Test starts; 0 mismatches. `G3` is now `VERIFIED`.
- Chapters 2–12: 88/88 official web pages fetched, 0 errors after correcting the 9.8 slug. Counts: 4,335 section exercises, 611 review exercises, 353 Practice Test items, 572 examples, 424 Try Its, 1,013 figures, 203 tables.
- Extracted 294 subsection-heading candidates; 289 match PDF pages by text; five are listed as TODOs for visual mapping. The exact page map and per-chapter plans are in private Drive.
- Uploaded all Ch. 2–12 web and PDF source extracts to Drive `source-extracts/`; uploaded `BOOK-TOC.md`, the verification/source-comparison reports, and all 11 chapter plans to Drive `reports/`. No source text or answer key was added to Git.
- Phase 2 content authoring is not complete: no Ch. 2–12 bank, answer key, validator run, or render smoke has been produced. Resume at Chapter 2 bank authoring; preserve the fixed order.
