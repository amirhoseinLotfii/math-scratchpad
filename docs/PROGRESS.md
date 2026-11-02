# Feature card progress

Build order follows `CODEX_SYNC_AND_FEATURES _1_.md` Scope 21. A card is complete only after its tests, CI, deploy, live check, Persian changelog entry, and merge. A green feature PR that depends on a later foundation stays open until that foundation is merged.

| Card | Status | PR / evidence |
| --- | --- | --- |
| P0-1 Event model | complete | PR #27 and zero-skip follow-up PR #31 merged; CI green and Pages live |
| P0-2 Durable Object + Worker | complete | [PR #32](https://github.com/amirhoseinLotfii/math-scratchpad/pull/32) merged as `08b8b56`; CI green; Worker deployed and live health/CORS/auth-boundary checks passed |
| P0-3 Browser outbox + migration | in progress | [draft PR #33](https://github.com/amirhoseinLotfii/math-scratchpad/pull/33); CI run `41405734437` green; live browser/OAuth and Drive read-back verification remains |
| P0-4 Drive mirror | in progress | PR #34 (`feat/p0-4-drive-mirror`); CI run `41412052462` green. Live Drive write/read-back remains blocked by the missing Google OAuth Worker Secrets. |
| P0-5 Notion mirror | in progress | PR #35 (`feat/p0-5-notion-mirror`); CI run `41415634995` green. Live Notion write/read-back remains blocked by the missing `NOTION_API_KEY`. |
| P0-6 Sync status UI | in progress | PR #36 (`feat/p0-6-sync-status-ui`); CI run `41417365846` green. Live mirror status checks remain pending because the authenticated owner API session and required secrets are unavailable. |
| P0-7 Backup and restore | in progress | [draft PR #37](https://github.com/amirhoseinLotfii/math-scratchpad/pull/37); code runs `41426538336` and `41433389336` passed, and the latest commit `2679f3f` passed CI run `41438762659` including `test:gate` and build. `npm test` (840 app + 53 Worker), typecheck, and build pass; live cron and Drive read-back remain blocked. |
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

- P0-1: رویدادهای یادگیریِ اعتبارسنجی‌شده و تغییرناپذیر اضافه شد. زمان فعالِ جلسه، درس، تکهٔ صفحه‌ای، سکشن، سؤال و گام با کنارگذاشتن زمان بیکاری، تب پس‌زمینه و توقف دستی ثبت می‌شود. پاسخ‌ها فقط پس از تلاش ثبت می‌شوند و نتیجهٔ درست/نادرست فقط از checker معتبر می‌آید. پس از شکست فوکوس در CI، بازگردانی فوکوس MathLive به ورودی زندهٔ همان گام چندبار در فریم‌های بعدی تلاش می‌کند. PR #27 و پیگیری حذف skipها در PR #31 ادغام شدند؛ تست‌های محدود به viewport با انتخاب پروژه اجرا می‌شوند و gate کامل CI بدون تست skipشده سبز شد. Pages نیز به commit نهایی P0-1 منتشر شد. رویدادهای سمت مرورگر تا کارت P0-3 در حافظه می‌مانند.
- P0-2: Worker همگام‌سازی با Hono، اعتبارسنجی ID token گوگل با JWKS، محدودکردن دسترسی به ایمیل مالک و CORS دقیق GitHub Pages، ذخیرهٔ append-only در SQLite Durable Object، idempotency، pagination و rate limit اضافه شد. ۱۶ تست Workers Vitest و Wrangler dry-run سبز هستند. CI در اجرای `41378938028` با ۸۰۰ تست واحد/یکپارچه، ۱۶ تست Worker و ۴۴۴ تست Playwright، بدون skip یا شکست، سبز شد. Worker با نسخهٔ `9d5c41bd-b338-45bb-b0bc-70c8129be568` منتشر شد. بررسی زنده: `/health` برابر ۲۰۰ و پاسخ سالم است؛ preflight مبدأ GitHub Pages برابر ۲۰۴، مبدأ دیگر برابر ۴۰۳ و `/sync` بدون توکن برابر ۴۰۱ است. مالک پاسخ HTTPS سلامت را هم در مرورگر موبایل تأیید کرد. PR #32 در `08b8b56` ادغام شد.
- P0-3: outbox آفلاین در IndexedDB، مهاجرت بررسی‌شدهٔ دادهٔ قدیمی و پشتیبان‌گیری خصوصی Drive اضافه شد؛ پاک‌سازی دادهٔ قدیمی تنها بعد از تأیید hash/count سمت سرور و read-back پشتیبان انجام می‌شود. صفحهٔ همگام‌سازی نام حساب Drive را با مالک مجاز می‌سنجد. `npm test` با ۸۳۱ تست و ۱۷ تست Worker سبز است؛ تست‌های محدود موبایل 390 و دسکتاپ 1024/1280/1440، مهاجرت و MathLive پس از reload هم سبز شده‌اند. اجرای کامل مرورگر محلی ۲۵۰ تست را گذراند، یک timeout در WIDE-02 داشت و یک تست را قطع کرد؛ WIDE-02 در اجرای جداگانه ۵ بار پیاپی گذشت. Firefox محلی ۴ از ۴ تست را گذراند؛ چهار تست WebKit به‌دلیل کتابخانه‌های سیستمی نصب‌نشده launch نشدند. CI کامل PR #33 در اجرای `41405734437` سبز شد. «نیاز به تست»: مهاجرت و read-back واقعی Drive در مرورگر مالک.
- P0-4: آینهٔ خصوصی Drive در Worker پیاده‌سازی شد: رویدادهای کامل JSONL ماهانه، projection پیشرفت، manifest با SHA-256 و زمان UTC/تهران؛ نوشتن با ETag، ادغام شناسهٔ رویداد و retry پس از شکست بخشی. برای فایل‌های بیش از ۵ مگابایت آپلود resumable افزوده شد و رویداد `isTest` در فایل ثبت می‌شود اما از projection یادگیری کنار می‌رود. `npm test` با ۸۳۱ تست برنامه و ۳۸ تست Worker، تست‌های persistence با ۶۰ سناریوی Playwright و `npm run build` سبز شدند. «نیاز به تست»: CI شاخه و تأیید زندهٔ یک رویداد آزمایشی پس از تنظیم OAuth Production و Worker Secrets توسط مالک.
- P0-5: طرح Notion به‌صورت افزایشی روی Math Attempts و Sessions موجود ثبت شد و سه دیتابیس خالی Mistakes، Concepts و Daily Reports ساخته شد؛ دیتابیس Events که متوقف شده بود دست‌نخورده ماند و هیچ ردیفی به Notion اضافه نشد. Worker اکنون رویدادهای تمرینی را با شناسهٔ idempotent ثبت می‌کند، ردیف جلسه و گزارش روز تهران را به‌روزرسانی می‌کند، تمرین‌های خطادار یا درستِ کم‌اطمینان را برای مرور نگه می‌دارد و رویدادهای آزمایشی را از آمار زنده کنار می‌گذارد. جمع زمان کل فقط از رویداد پایان جلسه انجام می‌شود تا scopeهای تو‌در‌تو چندبار شمرده نشوند. صف با فاصلهٔ حداقل ۳۵۰ میلی‌ثانیه، retry محدود، checkpoint پایدار و ادامه پس از شکست جزئی پیاده‌سازی شد. «نیاز به تست»: کلید Integration فقط در Cloudflare Secret، اشتراک پنج دیتابیس با Integration، CI شاخه و بررسی زندهٔ یک پاسخ و relation آن با جلسه پس از تأیید مالک.
- P0-6: نشانگرهای سرور، Drive و Notion از هم جدا شدند و هرکدام شمار رویدادهای در صف را نشان می‌دهد. جزئیات، زمان آخرین ارسال و خطای امن فارسی را نمایش می‌دهد؛ دکمهٔ «همگام‌سازی الان» صف سرور را می‌فرستد و آینه‌های تنظیم‌شده را جداگانه فعال می‌کند و برای آینهٔ تنظیم‌نشده درخواست نوشتن نمی‌فرستد. تست واحد و Playwright برای وضعیت‌ها، خطاها، دسترسی‌پذیری و چیدمان موبایل ۳۹۰ و دسکتاپ ۱۲۸۰ افزوده شد. «نیاز به تست»: بازبینی زندهٔ پاسخ وضعیت پس از تنظیم Cloudflare و تأیید مالک.
- P0-7: خروجی کامل JSON از cache مرورگر، صف آفلاین، رویدادهای تأییدشدهٔ سرور و فراداده با checksum ساخته می‌شود. بازیابی ابتدا فایل را اعتبارسنجی و پیش‌نمایش می‌کند، سپس با شناسهٔ پایدار رویدادها ادغام می‌کند؛ دادهٔ محلیِ متعارض حفظ و برخورد شناسه یا شمارهٔ توالی مسدود می‌شود. پشتیبان هفتگیِ تاریخچهٔ رویداد و projection پیشرفت در `Math_Project/06_Backups/sync_backup_YYYY-MM-DD.json` زمان‌بندی شده است؛ فایل checksum دارد، با ETag به‌روزرسانی می‌شود و همگام‌سازی‌های Drive برای جلوگیری از تداخل manifest پشت‌سرهم اجرا می‌شوند. هیچ Workerی در این مرحله deploy نشده است.
- بررسی زندهٔ Cloudflare در ۱۴۰۵/۰۸/۱۱ از Chrome متصل: Worker Production آماده و روی `workers.dev` فعال است و `/health` پاسخ `{"ok":true,"service":"math-scratchpad-sync"}` داد. در Production فقط binding `EVENT_STORE` و چهار متغیر پایه دیده شد؛ پنج متغیر `NOTION_DATA_SOURCE_*` در تنظیمات شاخه روی Worker زنده نیستند. هیچ Cron trigger، custom domain یا route ثبت نشده و نام هر سه Secret لازم (`GOOGLE_DRIVE_CLIENT_SECRET`، `GOOGLE_DRIVE_REFRESH_TOKEN` و `NOTION_API_KEY`) در فهرست موجود نبود. هیچ تنظیمی تغییر نکرد و هیچ داده‌ای در Drive یا Notion نوشته نشد؛ کارت‌های P0-3 تا P0-7 همچنان در حال انجام‌اند.

## P0-6 verification notes

- `npm test`: all 834 application tests and 49 Worker tests pass. `npm run test:typecheck -- --pretty false` and `npm run build` pass, including the Wrangler dry-run.
- Focused sync-panel/browser-runtime tests: 24 passed. P0-6 Playwright flow: mobile 390 and desktop 1280 both pass, including status refresh, configured mirror actions, no horizontal overflow, and serious/critical Axe checks.
- Full local persistence matrix: 60/62 passed on the first run; the two failures were rerun individually and passed. One was a navigation destroying an IndexedDB read context on laptop 1024; the other was an offline MathLive event not reaching IndexedDB at 1280 under the full matrix load. Both isolated reruns passed.
- Screenshots: `/workspace/p0-6-screenshots/mobile-390.png` and `/workspace/p0-6-screenshots/desktop-1280.png`.
- «نیاز به تست»: PR CI and a live `/drive/status` + `/notion/status` check after the owner approves Cloudflare configuration. No deployment or live sync was performed.

## P0-7 verification notes

- Full local recovery journey: export → clear all four IndexedDB learning stores → validate and preview → merge → reload. Unit tests verify exact restoration, checksum tamper rejection, local cache preservation, event-ID and sequence conflict blocking, and removal of an already-acknowledged queued event.
- Weekly Worker backup tests verify the private `06_Backups` folder, the complete sequenced event list and progress snapshot, SHA-256 correctness, same-week idempotency, cron owner targeting, Drive operation serialization, and independence from public event rate limits.
- `npm test`: all 840 application tests and 53 Worker tests passed. `npm run test:typecheck -- --pretty false` and the final `npm run build` including Wrangler dry-run passed.
- `npm run test:sync`: all 64 persistence Playwright tests passed, including export/wipe/restore at mobile 390 and desktop 1280. Both screenshots are saved at `/workspace/p0-7-screenshots/`.
- «نیاز به تست»: Cloudflare cron deployment and OAuth-backed Drive write/read-back in the owner's account. PR CI run `41421397869` passed. Nothing was deployed or written to live Drive.

## P0-1 test notes

- The event API is in-memory at this stage. Durable offline persistence belongs to P0-3.
- Timed scopes cover session, lesson, page-based concept chunk, section, question and the focused MathLive step; focus/visibility/idle time is shared.
- PR #27 initially reported 444 passed and 52 viewport-conditional skips. The follow-up PR #31 replaced runtime skips with Playwright project filters; all 444 selected tests passed without skipped tests.
- The final PR #31 CI run passed the browser gate, typecheck and build. Pages was deployed from merge commit `4a186e1` and the live page plus its referenced JS asset returned HTTP 200.
- WIDE-08 passed 20 consecutive runs across 1024px and 1440px after the prior focus adjustment and 20 consecutive 1440px runs after the latest retry change; both TypeScript checks passed again.
- `src/sync` line coverage is 93.21%. Follow-up `test/p0-1-zero-skips` replaces runtime `test.skip` guards with Playwright tag-based project selection; `npx playwright test --list` reports 444 selected tests. The follow-up PR CI passed with 444 passed, zero skipped, and zero failed.
- Merge commit `4a186e1` passed Pages deployment; the live page and its referenced JS asset both returned HTTP 200.
- CI runs the full Playwright matrix with one worker and one retry for transient focus flakes on constrained hosted runners; repeated failures still block the gate. Local runs retain two workers. Push CI is limited to `main`; feature branches are validated by their PR run.
- «نیاز به تست»: Safari/iOS visibility and focus behavior on a physical device.

## P0-2 verification notes

- Local `npm run test:gate`: typechecks passed, all 800 unit/integration tests passed, 16 Workers integration tests passed, and all 444 Playwright tests passed with zero skipped, failed, or flaky tests.
- `npm run build` passed for the app, standalone bundle, and Wrangler Worker dry-run. Authenticated deployment succeeded at `https://math-scratchpad-sync.math-scratchpad-redux.workers.dev`; `/health` returned `{"ok":true,"service":"math-scratchpad-sync"}` over HTTPS (confirmed by the owner) and HTTP (checked here). Live API boundary checks returned 204 for the allowed Pages preflight, 403 for a foreign origin, and 401 for `/sync` without a bearer token. The task environment proxy returned a TLS 503 for direct HTTPS calls to `workers.dev`, so those API boundary checks were exercised over HTTP; the same routes are covered by the green Worker integration suite. PR #32 was merged as `08b8b56`.

## P0-3 verification notes

- `npm test`: 831 unit/integration tests and 17 Workers tests passed. `npm run build` passed before the final documentation and gate-runner test updates; no application source changed afterward.
- Focused Playwright: offline queue/reconnect passed at mobile 390 and desktop 1440/1280; migration fixture passed at desktop 1440; MathLive and outbox passed at laptop 1024/1440 and mobile 390. WIDE-02 timed out once in the full local browser gate; an isolated run and five consecutive repeats passed.
- Full local gate is recorded as blocked: typecheck, Worker tests and unit/DOM coverage passed; Chromium ran 250 passed, one failed and one interrupted before the remaining 196 ran. The sync browser matrix ran all four Firefox tests successfully; WebKit could not launch because this executor lacks GTK/Graphene/Harfbuzz/Manette/Hyphen/GLES host libraries. CI installs Firefox/WebKit with `--with-deps` and remains the authoritative cross-browser result.
- No live migration was performed: this environment has no connected browser session, and Gmail requires reauthentication. OAuth, private Drive backup/read-back and owner-account matching still need the owner's real browser session.

## P0-4 verification notes

- `npm test`: 831 app tests and 38 Worker tests pass. `npm run test:sync`: all 60 persistence/outbox Playwright scenarios pass across mobile 320/390/430, laptop 1024/1440 and desktop 1920/2560. `npm run build` passes the app, standalone bundle, and Wrangler dry-run.
- Worker tests cover event projection and hashing, exact owner checks, private file creation (no permissions API), ETag conflict merge/retry, quota failure/recovery, OAuth error mapping, resumable uploads above 5 MB, and a 50,000-event SQLite read/write projection.
- Live Google Drive OAuth and file read-back have not been run. The repository contains no Google refresh token or Drive client secret; the owner must configure both as Cloudflare Worker Secrets after changing Google OAuth consent to Production.

## P0-5 verification notes

- `npm test`: all 831 application tests and 49 Worker tests pass. The focused Notion Worker suite includes 11 tests for property mapping, Tehran dates, test-event exclusion, idempotent upserts after loss of the local page cache, mistake review resolution, 429 retry/rate spacing, owner-only routes, and partial-failure cursor recovery. `npm run test:typecheck -- --pretty false` passes.
- `npm run test:sync`: all 60 Playwright persistence checks pass at mobile 320/390/430 and laptop/desktop 1024/1440/1920/2560. `npm run build` passes app, standalone bundle, and Wrangler dry-run (Worker 435.60 KiB / 85.83 KiB gzip). The Notion SDK/API identifiers are absent from `dist`; the API key is absent from source/configuration. `wrangler.jsonc` contains only non-secret data-source IDs. `git diff --check` passes.
- Live Notion API requests, schema write validation, Cloudflare deployment, and a tagged learner-event read-back have not been run. They require the owner's Cloudflare approval, a Notion integration key shared with the five listed data sources, and green PR CI.


## Current verification snapshot — 2026-11-02

- At the start of this verification, PR #37 was open and draft on `feat/p0-7-backup-restore` at HEAD `70fa8cd29fe54d8bba94e86cf5030c286bea1bb0`. CI runs `41426538336` (code) and `41433389336` (that HEAD) both succeeded; the earlier card runs `41405734437`, `41412052462`, `41415634995`, and `41417365846` are also green. This report changes documentation only.
- A clean, isolated clone was used without changing other checkouts. `npm ci` succeeded; `npm test` passed 840 app and 53 Worker tests; `npm run test:typecheck -- --pretty false` and `XDG_CONFIG_HOME=/tmp/math-scratchpad-p0-7-xdg npm run build` passed, including the Wrangler dry-run.
- The local `npm run test:gate` is blocked by this executor: 108 browser cases passed before one mobile-390 focus timeout stopped the browser matrix; Firefox/WebKit were initially absent, and although their Playwright binaries downloaded, required system libraries are missing. The CI job installed its browser dependencies and its full gate plus build succeeded. Generated screenshot changes were restored; the only tracked changes now are these requested documentation updates.
- The connected Chrome dashboard shows Production Worker `math-scratchpad-sync`, active version prefix `9d5c41bd`, Ready, on `workers.dev`. The current `/health` page displayed `{"ok":true,"service":"math-scratchpad-sync"}`.
- Production has the `EVENT_STORE` Durable Object and four base variables only. The five `NOTION_DATA_SOURCE_*` variables defined in this branch's `worker/wrangler.jsonc` are absent. The three required Worker Secret names—`GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`, and `NOTION_API_KEY`—are absent; no secret values were read.
- The Worker has no Cron trigger although this branch declares `0 2 * * 0`; no custom domain or route is configured. No setting or deployment changed.
- Drive metadata confirms the private `Math_Project/06_Backups` folder exists and contains no `sync_backup_*.json`; the `Math_Project/03_Sync` folder was not found. No Drive content was read or written.
- The five configured Notion data-source IDs resolve to Math Attempts, Sessions, Mistakes, Concepts, and Daily Reports. Integration sharing and Worker API access are not verified; no Notion write was made and the paused Events database was left untouched.
- The Chrome Google Cloud Console tab is on the organizational Ziprin account and still shows the 2-step verification access block. The connected Drive profile matches this branch's configured `OWNER_EMAIL`, but the Cloud Console account does not; the browser security review rejected a further read on that corporate-account page. No OAuth credential was generated. The app's live migration and server/Drive hash-count read-back were not run, and no local browser keys were cleared.
- The referenced `CODEX_SYNC_AND_FEATURES _1_.md` file is absent from this branch; this update follows the available card instructions and existing `docs/PROGRESS.md` without inferring extra scope from the missing file.
- No Cloudflare MCP tool is available in this Work mode session. Cloudflare's official `prompt.md` was read from the Cloudflare documentation repository; it specifies Codex MCP registration/login, but the `codex` CLI is absent here. The connected dashboard was used for read-only checks; no API token was created. PR #37 remains unmerged and draft.

| Card | Current evidence | Live work still required |
| --- | --- | --- |
| P0-3 | PR #33 CI `41405734437` and stacked branch CI `41433389336` green; latest stacked validation `41438762659` also green; automated migration tests pass. | Use the configured personal Google owner account for OAuth, then verify tagged server and Drive backup read-back with hash/count before the app's safe migration flow; no browser data cleared. |
| P0-4 | PR #34 CI `41412052462`, stacked branch CI `41433389336`, and latest stacked validation `41438762659` green; Worker tests and build pass. | Configure Google Worker Secrets, deploy the branch, then verify the private sync files and one documented tagged test event; `03_Sync` is not present yet. |
| P0-5 | PR #35 CI `41415634995`, stacked branch CI `41433389336`, and latest stacked validation `41438762659` green; five configured Notion sources resolve to the expected titles. | Confirm/share only the five sources with the project integration, configure `NOTION_API_KEY`, then verify a tagged Attempt and its Session relation. |
| P0-6 | PR #36 CI `41417365846`, stacked branch CI `41433389336`, and latest stacked validation `41438762659` green; local typecheck/build pass. | Deploy and inspect authenticated `/drive/status` and `/notion/status` responses after required credentials are configured. |
| P0-7 | CI runs `41426538336`, `41433389336`, and `41438762659` are green; the latest run includes the full browser gate and build. Local full gate is blocked by host browser dependencies/focus timeout. | Switch Chrome to the configured personal Google account, configure the three Worker Secrets and five Notion variables, deploy this branch with Cron `0 2 * * 0`, then verify one tagged Drive backup/write/read-back and the scheduled backup. |
