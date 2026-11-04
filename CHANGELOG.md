# Changelog

## بررسی زنده پس از اصلاح Drive — ۲۰۲۶-۱۱-۰۴

- اصلاح PR #44 روی همان SHA آزموده‌شده `37ab15ec57de1d5dc2bc0226764fc1b1676ab564` در Worker موجود منتشر شد؛ build موفق بود و نسخهٔ Worker با ۱۰۰٪ ترافیک فعال است. `/health` پاسخ ۲۰۰ داد.
- یک رویداد ساختگیِ `isTest=true` از رابط برنامه همگام شد. بازخوانی فایل immutable در Drive نشان داد SHA-256 محتوا با هش نام فایل برابر است و manifest همان snapshot و hash را ارجاع می‌دهد. در Notion، Attempt و Session پیوندخورده با `Data Mode=Test` بازخوانی شدند؛ صف‌های برنامه صفر شدند.
- CI کامل همین SHA، شامل gate و build، سبز است. ۴۸ تست متمرکز snapshot/Drive، typecheck Worker و `git diff --check` نیز موفق شدند.
- نتیجهٔ فرمول `Data Check` در خروجی Notion connector قابل مشاهده نبود و هنوز مستقل تأیید نشده است. اجرای واقعی پشتیبان هفتگی و read-back آن و بررسی مهاجرت دادهٔ قدیمی هم باقی است. PR #44 باز و Draft مانده؛ این تغییر Worker را منتشر کرد، نه Pages را.

## سابقهٔ بررسی پیش از انتشار اصلاح snapshot — ۲۰۲۶-۱۱-۰۴

- PR #44: نوشتن فایل‌های رویداد، وضعیت، manifest و پشتیبان هفتگی به snapshotهای تغییرناپذیرِ نام‌گذاری‌شده با SHA-256 وصل شد. پس از هر نوشتن، یکتایی نام و بازخوانی دقیق محتوا بررسی می‌شود؛ فایل‌های قدیمی فقط خوانده می‌شوند و دست‌نخورده می‌مانند. retry پشتیبان هفتگی پس از گم‌شدن پاسخ upload از زمان ثابت استفاده می‌کند. ۴۸ تست متمرکز Drive/snapshot، typecheck و بررسی فاصله‌های انتهایی موفق شدند. CI commit تازه هنوز باید اجرا شود؛ deploy و read-back زنده انجام نشده‌اند و مشکل Drive در Production رفع‌شده اعلام نمی‌شود.

- آزمایش زنده روی یک فایل مستقل آزمایشی نشان داد درخواست PATCH محتوای Drive v3 با ETag قدیمی و هدر If-Match پاسخ ۲۰۰ گرفت و محتوای آزمایشی جدید در بازخوانی دیده شد؛ این نتیجه مربوط به همان مسیر و آزمایش است و قابل تعمیم قطعی به upload چندمرحله‌ای نیست. فایل‌های یادگیری دست‌نخورده ماندند.

- CI تغییر تشخیصی Drive سبز شد و نسخهٔ تشخیصی Worker منتشر شد؛ تنظیمات و Durable Object حفظ شدند.
- پاسخ محتوای Drive فاقد ETag بود، اما metadata نسخهٔ دوم آن را داشت. اعتبار این شناسه برای جلوگیری از بازنویسی هم‌زمان هنوز تأیید نشده است؛ Drive و تست زندهٔ رفت‌وبرگشت هنوز تکمیل نشده‌اند.


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

- پیگیری تازه: اجرای CI `41443911466` روی head مستنداتی `8e06b41` با `test:gate` و build سبز شد. حساب Google Cloud متصل با `OWNER_EMAIL` شاخه تطبیق دارد و مانع MFA برطرف شده، اما جست‌وجوی پروژه `divine-descent-511113-c9` در انتخابگر پروژه پیام «No resources to display» داد؛ وضعیت OAuth هنوز قابل بررسی نیست و هیچ اعتبارنامه‌ای ساخته نشد.
- پنجرهٔ اشتراک Math Attempts فقط مالک را نشان می‌دهد؛ هیچ Integration اضافه یا ردیفی در Notion نوشته نشد. Production Cloudflare بدون تغییر باقی ماند و PR #37 باز و draft است.


## پیگیری زندهٔ Cloudflare و همگام‌سازی — ۱۴۰۵/۰۸/۱۱

- PR #37 روی head `343f25f7a9f7d5c4ef217decc963bf38187c16a5` باز و draft ماند. اجرای `41452398541` با `test:gate` کامل و build سبز شد؛ تست‌های محلی ۸۴۰ برنامه و ۵۳ Worker، typecheck و build نیز روی کد همسان با head موفق بودند.
- پروژهٔ `divine-descent-511113-c9` در جست‌وجوی انتخابگر Google Cloud نبود و فرم رسمی ایجاد پروژه اعلام کرد Project ID در دسترس نیست؛ پروژهٔ جایگزینی ساخته نشد. پروژهٔ انتخاب‌شدنی `math-scratchpad` همان OAuth client تنظیم‌شده در شاخه را دارد. نشانی خانهٔ عمومی برنامه ذخیره شد و scopeهای `drive.file` و `userinfo.email` تأیید شدند؛ consent همچنان Testing است و به‌علت خالی‌بودن پیوند سیاست حریم خصوصی و شرایط، OAuth credential ساخته نشد.
- Worker Production هنوز نسخهٔ `9d5c41bd` و health سالم دارد. فقط `EVENT_STORE` و چهار متغیر پایه حاضرند؛ پنج متغیر Notion، سه نام Secret لازم و Cron هفتگی غایب‌اند. Wrangler احرازنشده بود، Cloudflare MCP در دسترس نیست و deploy یا تغییر Production انجام نشد.
- در Drive فقط فراداده بررسی شد: `Math_Project/06_Backups` موجود است اما فایل پشتیبان زمان‌بندی‌شده دیده نشد و `03_Sync` وجود ندارد. Developer portal در Notion هیچ connectionای نشان نداد؛ فرم ساخت، پذیرش Developer Terms را شرط می‌کند، پس پیش از ساخت connection، اشتراک منبع‌ها یا ایجاد key متوقف شدم. هیچ ردیفی به Notion نوشته نشد.
- فایل `CODEX_SYNC_AND_FEATURES _1_.md` همچنان در شاخه نیست. کارت‌های P0-3 تا P0-7 در انتظار بررسی‌های زندهٔ credential، deploy و read-back باقی ماندند؛ PR #37 ادغام نشد.

## پیگیری CI پس از ثبت وضعیت زنده — ۱۴۰۵/۰۸/۱۱

- اجرای `41459736025` روی commit مستنداتی `7003216` با موفقیت کامل شد؛ `npm run test:gate` و build سبز هستند. PR #37 باز و draft است. این ثبت مستندات، deploy یا تغییر Cloudflare انجام نمی‌دهد.

## پیگیری CI تکمیلی — ۱۴۰۵/۰۸/۱۱

- اجرای `41465555192` روی commit مستنداتی `2c0a1c6dfeef1eee196f2a0991125780389593ed` با موفقیت کامل شد؛ `npm run test:gate` و build سبز هستند. PR #37 باز و draft ماند. هیچ deploy یا تغییر Production انجام نشد.

## پیگیری CI نهایی — ۱۴۰۵/۰۸/۱۱

- اجرای `41472444422` روی commit مستنداتی `64065f5b237fa20d6d8e146d18bdb5b321c7a232` با موفقیت کامل شد؛ `npm run test:gate` و `npm run build` سبز شدند. PR #37 باز و draft ماند و هیچ تغییری در Cloudflare Production یا داده‌های Drive/Notion انجام نشد.


## پیگیری تازهٔ کد و CI — ۱۴۰۵/۰۸/۱۱

- روی شاخهٔ `feat/p0-7-backup-restore` محدودیت ۵۰ مگابایتی خروجی پشتیبان با محدودیت ورودی یکسان شد و تست مرزی برای اندازهٔ مجاز و یک بایت بیشتر اضافه شد. تست متمرکز ۷ مورد، `npm test` شامل ۸۴۱ تست برنامه و ۵۳ تست Worker، typecheck، build و `git diff --check` موفق شدند.
- اجرای CI شمارهٔ `41486421259` روی head برابر `2dfab885e7988d9f56081cb22f04a486328dfc9e` با `test:gate` و build سبز شد. PR #37 تازه بررسی شد: باز، draft و ادغام‌نشده است.
- `npm run test:manual-gate` هنوز به‌علت ۱۸ بررسی دستیِ pending در `docs/testing/manual-acceptance.json` بسته است؛ این موارد شامل دستگاه واقعی و دسترس‌پذیری‌اند و با CI خودکار جایگزین نمی‌شوند.
- این نشست ابزار GitHub دارد، اما به Chrome محلی مالک یا Cloudflare وصل نیست. اینجا هیچ بررسی زندهٔ تازه‌ای از Cloudflare، Google، Drive یا Notion، تغییر حساب یا deploy انجام نشد؛ مشاهدات زندهٔ قبلی در بالا سابقه‌اند، نه تأیید وضعیت فعلی. P0-3 تا P0-7 تا انجام OAuth/Secrets، deploy و read-back واقعی باز می‌مانند.


## بررسی زندهٔ جدید Cloudflare و CI — ۱۴۰۵/۰۸/۱۱

- PR #37 باز و draft ماند. head فعلی `6f495c1b808c9e3ce1e5c6583670b7e9b39774c6` در اجرای کامل CI شمارهٔ `41493469737` با موفقیت از gate و build گذشت.
- اتصال Cloudflare MCP در این نشست فقط‌خواندنی بود. Worker Production `math-scratchpad-sync` همچنان نسخهٔ `9d5c41bd-b338-45bb-b0bc-70c8129be568` را روی `workers.dev` اجرا می‌کند؛ فقط binding `EVENT_STORE` و چهار متغیر پایه حاضرند. پنج متغیر Notion، سه نام Secret لازم و Cron هفتگی در Production حاضر نیستند. هیچ route، دامنه، DNS، Secret یا deployment تغییر نکرد.
- درخواست تازهٔ `/health` قابل تأیید نبود. در Drive پوشهٔ خصوصی `Math_Project/06_Backups` با ۱۵ مورد دیده شد اما فایل پشتیبان زمان‌بندی‌شده وجود نداشت؛ `03_Sync` پیدا نشد. هیچ رویداد یا فایل آزمایشی نوشته نشد و Notion read-back انجام نشد.
- نبود Secretها مانع deploy و آزمون زندهٔ Drive/Notion است. کارت‌های P0-3 تا P0-7 باز می‌مانند؛ PR #37 ادغام نشده است.


## ثبت پیگیری زندهٔ سرویس‌های همگام‌سازی — ۱۴۰۵/۰۸/۱۱

- CI head فعلی PR #37، run `41499408955`، شامل gate کامل و build سبز است؛ PR باز و draft ماند.
- Cloudflare MCP فعال است؛ Worker نسخهٔ `9d5c41bd` را با ۱۰۰٪ ترافیک اجرا می‌کند. پنج data source variable، سه نام Secret و Cron در Production نیستند. deploy انجام نشد.
- در Google Console، OAuth هنوز External / Testing است؛ پیوند Privacy/Terms خالی و scope `userinfo.email` در فهرست دیده نشد. هیچ credential خوانده/ساخته نشد. در Notion Developer connection وجود ندارد و ساخت آن پذیرش Developer Terms می‌خواهد.
- Drive owner match شد؛ پوشهٔ backup ۱۵ مورد دارد اما فایل زمان‌بندی‌شده ندارد و پوشهٔ `03_Sync` پیدا نشد. داده‌ای نخواندیم/ننوشتم. کارت‌های P0-3 تا P0-7 تا تکمیل شرط‌های خود باز می‌مانند.


## تست‌های محلی پس از بررسی سرویس‌ها — 2026-11-03

- `npm test`: ۸۴۱ تست برنامه در ۵۷ فایل و ۵۳ تست Worker در ۳ فایل موفق شدند.
- `npm run test:typecheck -- --pretty false` و `XDG_CONFIG_HOME=/tmp/math-scratchpad-xdg npm run build` موفق شدند؛ build شامل standalone bundle و Wrangler dry-run بود.
- CI run `41513230008`، شامل `npm run test:gate` و build، سبز شد. هشدارهای bundle و `use client` غیرمسدودکننده بودند.
- هیچ deploy یا نوشتن زنده‌ای در Drive/Notion انجام نشد.


## تنظیم OAuth گوگل — 2026-11-03

- scope `userinfo.email` اضافه و ذخیره شد؛ پس از بارگذاری مجدد هر دو scope موردنیاز، همراه با `drive.file`، دیده شدند. هیچ credentialی خوانده یا ساخته نشد.
- CI اجرای `41546783299` با gate و build سبز شد؛ OAuth Production، Secretها و آزمون زنده همچنان باقی‌اند.


## اتصال Notion — 2026-11-03

- با اختیار مالک، connection خصوصی `Math Scratchpad Sync` ساخته شد و شرایط نمایش‌داده‌شدهٔ Developer Terms هنگام ساخت پذیرفته شد. دسترسی پنج منبع Math Attempts، Sessions، Mistakes، Concepts و Daily Reports ثبت و در فهرست دسترسی دیده شد.
- مقدار کلید مشاهده یا دریافت نشد و فهرست Secretهای Worker همچنان خالی بود؛ deploy و تست زنده انجام نشدند.
