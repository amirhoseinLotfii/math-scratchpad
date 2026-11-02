# Changelog

## 0.6.0 — 2026-10-27

### Added
- **Tutor export** (`Export for tutor (JSON)` in the menu): versioned session JSON (`schema_version: math-scratchpad.session/1.0`) with session id, anxiety/energy (1–5), start/end time, and per item: `item_id`, `status`, `student_answer`, `final_answer`, `final_step_id`, verbatim `steps[]`, `started_at`/`submitted_at` (ISO-8601 with UTC offset), `solve_time_sec`, `confidence` (5/3/1), `hint_used`/`hint_note`, `independent`. Copied to clipboard and downloaded as a file.
- Pre-export warning listing answered questions that have no marked final answer.
- `Alt + Enter` marks the current step as the final answer (the per-step **Final** button remains).
- Session panel: math-anxiety and energy pickers, per-question "Tutor help used" + note, and final-answer status.
- Persistence controls: always-visible **Saved ✓** indicator, Download/Import backup file, End session, Reset current session and Reset all local storage (both with confirmation dialogs).
- GitHub Pages deployment workflow (`.github/workflows/pages.yml`).

### Changed
- The confidence picker is preselected to **High (5)** and can never be submitted empty.
- Stored drafts keep the versioned key `math-scratchpad-session-v3`; older v2/v1 drafts and backups without session metadata still load (new fields are optional and validated).

## 0.5.1 — 2026-10-25

### Fixed
- Identify simplified negative fractions and negative integers accurately in diagnostic form grading.
- Delete the next token at a main-line gap; Backspace targets the previous one, with Redux Undo/Redo.

### Improved
- More neutral, no-hint diagnostic question statements.
- Added regression cases for signed forms, ambiguous notation and gap deletion.
- Refreshed English/Persian documentation and shareable release copy.

### Verification boundary
- GitHub CI tests and builds validate the commit; physical keyboards, assistive tech, and embedded ChatGPT hosts need additional real-device checks.


## 0.5.0 — 2026-10-25

### Added
- Thirty no-hint Persian-stem fraction diagnostic questions displayed as LTR mathematical expressions.
- Exact rational (BigInt) diagnostic feedback separating numerical correctness, required form and equality-chain consistency.
- Keyboard-driven insertion chooser, horizontal same-level and vertical fraction navigation.
- Per-question progress retained while using Previous / Next Problem.

### Changed
- Responsive desktop notebook and optional side keyboard with full-width collapsed state.
- UI remains English and LTR; only the question statement uses Persian RTL.
- Keyboard stays closed by default, with best-effort stored preference.

### Fixed
- Structural Delete/Backspace and undo/redo shortcuts independent of keyboard visibility.
- Session metadata validation for the expanded 30-question bank.
- Old tests that assumed the keyboard was nested inside each step.

### Limitations
- Automated diagnostic feedback is provisional, not a substitute for manual review.
- Physical device keyboard and accessibility testing is still required.
- Cross-conversation updates are not possible with the embedded-chat edition.



## 0.4.0 — 2026-10-23

### Changed

- Start numeric keys at the top-left with 1–3 and place Backspace beside quick templates at the top-right.

- Match the gallery direction with a charcoal/forest-green shell, mint highlights, rounded step cards and more readable numeric keys.
- Render original problems as read-only math using the existing formula renderer.
- Show topic-specific template previews alongside symbol rows, plus favorites and recent symbols.
- Add genuine Edited badges, clearer whole-structure actions and explicit session-backup guidance.
- Use product-container breakpoints for stacked mobile layouts without assuming the width of the ChatGPT viewport.

### Fixed

- New steps and final-answer flag changes no longer incorrectly mark later math as needing review.
- Session restore preserves real edit markers; previews cannot change the editing selection.

### Validation

- 29 automated tests and production build pass. Android visual/touch checks are still pending; image-perfect matching is not claimed.

## 0.3.0 — 2026-10-23

### Added

- React/TypeScript implementation with Redux Toolkit, typed hooks and bounded document history.
- Compact/full math keyboard, structural Next and full-structure clipboard actions.
- New problem from current expression, recent/favorite symbol controls.
- Successful-copy snapshots and changed-since-copy status.
- Versioned session persistence and legacy import, automated tests and build tooling.

### Preserved

- Direct LTR editing, ASCII digits, vertical fractions and main-line insertion beside fractions.
- Ordered independent steps, explicit final-answer selection and downstream review markers.
- Check copies a complete review prompt for manual pasting and sending in the conversation.

### Known limitations

- No local solver, graphing or direct ChatGPT message sending.
- Partial LaTeX importer; advanced templates transfer losslessly through JSON sessions.
- Physical Android and screen-reader checks remain pending.

## گزارش بررسی زندهٔ همگام‌سازی Cloudflare — ۱۴۰۵/۰۸/۱۱

- شاخهٔ `feat/p0-7-backup-restore` روی commit `70fa8cd` بررسی شد. CIهای `41426538336` و `41433389336` سبز هستند؛ `npm test` با ۸۴۰ تست برنامه و ۵۳ تست Worker، typecheck و build محلی هم گذشتند. gate محلی به timeout فوکوس و کتابخانه‌های مرورگرِ نصب‌نشده در محیط محدود شد.
- Worker Production همچنان نسخهٔ `9d5c41bd` را اجرا می‌کند و `/health` پاسخ سالم داد. Secretهای Google و Notion و پنج متغیر data source در Production حاضر نیستند؛ Cron هفتگی هم هنوز تنظیم نشده است. deploy جدید انجام نشد.
- پوشهٔ خصوصی `Math_Project/06_Backups` وجود دارد اما فایل `sync_backup_*.json` در آن دیده نشد؛ `03_Sync` پیدا نشد. پنج data source پیکربندی‌شدهٔ Notion به عنوان Math Attempts، Sessions، Mistakes، Concepts و Daily Reports تأیید شدند؛ هیچ ردیفی نوشته نشد.
- Google Cloud Console در Chrome برای ادامه به تأیید MFA مالک نیاز دارد. هیچ OAuth secret، refresh token یا API token ساخته یا خوانده نشد. PR #37 باز و draft باقی ماند.
- اجرای CI `41438762659` روی commit مستنداتی `2679f3f` نیز با موفقیت کامل `test:gate` و build را گذراند. وضعیت فعلی Cloudflare دوباره بررسی شد: چهار متغیر پایه و binding `EVENT_STORE` حاضرند؛ پنج متغیر `NOTION_DATA_SOURCE_*`، سه Secret لازم و Cron هفتگی حاضر نیستند. deploy انجام نشد.
- پروفایل Drive متصل با `OWNER_EMAIL` شاخه مطابقت دارد، اما تب Google Cloud در Chrome روی حساب سازمانی Ziprin مانده و MFA را می‌طلبد. بازبینی امنیتی مرورگر از مشاهدهٔ بیشتر آن حساب سازمانی جلوگیری کرد؛ طبق Scope حساب شخصی هنوز برای OAuth استفاده نشده و هیچ اعتبارنامه‌ای ساخته نشد. PR #37 همچنان باز و draft است.
