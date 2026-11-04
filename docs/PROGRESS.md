# Feature card progress

## Drive immutable snapshot integration — 2026-11-04

- PR #44 now wires content-addressed snapshots into the Drive mirror for monthly event JSONL, progress, editor state, manifest, and weekly backups. Each snapshot name includes the SHA-256 of its exact UTF-8 content; writes create a new Drive file and require a unique-name lookup plus exact read-back. Existing mutable logical-name files are read during migration and left untouched. Duplicate names or content/hash mismatches fail closed. The manifest records the latest snapshot ID, name, and hash per logical path.
- Weekly-backup retries persist a stable creation timestamp before upload, so a lost upload response can find and reuse the verified snapshot instead of creating another copy. Canonicalized event JSONL keeps identical event sets idempotent.
- Focused validation on the isolated PR #44 source: `worker/tests/immutable-snapshot.test.ts` and `worker/tests/drive-mirror.test.ts` — 48 passed; Worker TypeScript check passed; whitespace check passed. Existing full CI run [41812680632](https://github.com/amirhoseinLotfii/math-scratchpad/actions/runs/41812680632) passed on the prior snapshot-foundation commit; CI for this integration commit is pending.
- This is implementation and local verification only. No Worker deploy, live Drive/Notion write, or production read-back occurred. Keep the card in progress until the new CI and live checks pass.

## Live Drive investigation — 2026-11-04

- Isolated live probe (Google OAuth Playground, personal account, `drive.file` scope): a uniquely named disposable JSON file was created and tagged as a probe. Its Drive v2 metadata ETag was read, content A was PATCHed to the v3 media-upload route with `If-Match`, then distinct content B was PATCHed with the same old ETag. Both requests returned HTTP 200; the second request was confirmed to include `If-Match`, the final ETag differed from the original, and read-back returned B with `isTest: true`. On this route and test, the stale precondition did not prevent overwrite. This is empirical evidence, not a documented universal guarantee or a test of resumable uploads. No learner file was modified. The standalone probe remains in Drive and is not part of the event mirror.

- PR #43 commit `27a5e93617da5a8b52a339b2746bace3c50df669`: CI [41795610368](https://github.com/amirhoseinLotfii/math-scratchpad/actions/runs/41795610368) passed, including gate and build; 70 Worker tests passed locally in an isolated copy.
- Cloudflare build `eebe4efe-afe0-4d53-b04e-5f6a661e18c5` succeeded for that commit. Production version `4241b28b-0525-4dd6-af25-36ac6da16094` serves 100% traffic. The existing Durable Object namespace and configured secret names were retained.
- Live, read-only diagnostic: Drive v3 media response lacks an ETag; Drive v2 metadata returns an ETag. This does **not** establish that Drive v3 enforces a conditional media update using that validator. The mirror remains blocked rather than risk overwriting concurrent edits. Prior app observation: 93 Drive events pending; current count requires verification.
- Notion previously reported synced; its synthetic write/read-back, Drive write/read-back, and verified conflict handling remain outstanding. The diagnostic version is not a Drive fix.


Build order follows `CODEX_SYNC_AND_FEATURES _1_.md` Scope 21. A card is complete only after its tests, CI, deploy, live check, Persian changelog entry, and merge. A green feature PR that depends on a later foundation stays open until that foundation is merged.

| Card | Status | PR / evidence |
| --- | --- | --- |
| P0-1 Event model | complete | PR #27 and zero-skip follow-up PR #31 merged; CI green and Pages live |
| P0-2 Durable Object + Worker | complete | [PR #32](https://github.com/amirhoseinLotfii/math-scratchpad/pull/32) merged as `08b8b56`; CI green; Worker deployed and live health/CORS/auth-boundary checks passed |
| P0-3 Browser outbox + migration | in progress | [draft PR #33](https://github.com/amirhoseinLotfii/math-scratchpad/pull/33); CI run `41405734437` green; live browser/OAuth and Drive read-back verification remains |
| P0-4 Drive mirror | in progress | PR #34 (`feat/p0-4-drive-mirror`); CI run `41412052462` green. Live Drive write/read-back remains blocked by the missing Google OAuth Worker Secrets. |
| P0-5 Notion mirror | in progress | PR #35 (`feat/p0-5-notion-mirror`); CI run `41415634995` green. Live Notion write/read-back remains blocked by the missing `NOTION_API_KEY`. |
| P0-6 Sync status UI | in progress | PR #36 (`feat/p0-6-sync-status-ui`); CI run `41417365846` green. Authenticated live status checks remain pending while mirror credentials are absent. |
| P0-7 Backup and restore | in progress | [draft PR #37](https://github.com/amirhoseinLotfii/math-scratchpad/pull/37); current head `6f495c1b808c9e3ce1e5c6583670b7e9b39774c6` passed full gate/build in `41493469737`. Live Cron and Drive read-back remain pending. |
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

- PR #37 remains open and draft on `feat/p0-7-backup-restore`. Latest documentation commit `64065f5b237fa20d6d8e146d18bdb5b321c7a232` passed run `41472444422`, including `npm run test:gate` and `npm run build`; preceding stacked runs `41465555192`, `41452398541`, and `41459736025` and earlier P0-3–P0-6 runs (`41405734437`, `41412052462`, `41415634995`, `41417365846`) also passed.
- Local `npm test` passed 840 application and 53 Worker tests; `npm run test:typecheck -- --pretty false` and `XDG_CONFIG_HOME=/tmp/math-scratchpad-xdg npm run build` passed, including Wrangler dry-run, on code identical to the current remote head. Local `npm run test:gate` was not run; CI completed the full gate and build.
- The connected Chrome profile is the personal Google account that matches the configured owner. Project selector search for `divine-descent-511113-c9` returned no resources; the official project creation form then reported `Project ID is not available.` No project was created. The existing selectable `math-scratchpad` project contains the OAuth client configured in `worker/wrangler.jsonc`.
- Google Auth Platform for `math-scratchpad` remains External / Testing and `Publish app` is disabled. The verified GitHub Pages home page was saved, and Data Access now contains `drive.file` and `userinfo.email`. Privacy-policy and terms links remain empty. No OAuth client secret or refresh token was generated.
- Production Worker `math-scratchpad-sync` remains on active version prefix `9d5c41bd`, Ready on `workers.dev`; `/health` returned HTTP 200 with the expected service health response. Production has binding `EVENT_STORE` and four base variables only. All five `NOTION_DATA_SOURCE_*` variables and Secret names `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`, and `NOTION_API_KEY` are absent. No Cron trigger is configured although this branch declares `0 2 * * 0`. No Worker settings, route, domain, or deployment changed.
- Wrangler reports unauthenticated in this workspace, and no Cloudflare MCP tool is available. No API token was created. The exact Cloudflare `prompt.md` endpoint could not be retrieved here because its `text/markdown` response was blocked; the official Cloudflare Codex setup guide was reviewed instead.
- Drive metadata confirms private `Math_Project/06_Backups` exists with 15 items and no `sync_backup_*.json`; `Math_Project/03_Sync` was not found. No Drive content was read or written.
- The five configured Notion sources resolve to Math Attempts, Sessions, Mistakes, Concepts, and Daily Reports. The Developer portal lists no connections. Its new-connection form states that creation agrees to Notion Developer Terms; the flow was stopped before creating a connection, accepting terms, sharing sources, or generating a key. The Math Attempts share dialog lists only the owner; the other four share states were not verified. No Notion row was written and the paused Events database was untouched.
- The referenced `CODEX_SYNC_AND_FEATURES _1_.md` file remains absent. No P0-3 live migration was run and no local browser keys were cleared.

| Card | Current evidence | Live work still required |
| --- | --- | --- |
| P0-3 | PR #33 CI `41405734437` and current stacked gate `41452398541` passed; the configured OAuth client is in `math-scratchpad`; homepage and required scopes are now set. | Add a valid public privacy-policy URL, complete production OAuth and credentials, then verify tagged server/Drive read-back hashes and counts before safe migration. No browser data was cleared. |
| P0-4 | PR #34 CI `41412052462` and current stacked gate/build passed; Worker tests and build pass. | Configure the two Google Worker Secrets, deploy after credentials and auth are ready, then verify one `isTest` event and Drive read-back. `03_Sync` is absent. |
| P0-5 | PR #35 CI `41415634995` and current stacked gate/build passed; the five configured Notion sources resolve to expected titles. No integration exists in the workspace. | Review and accept Notion Developer Terms to create the project connection, share only the five listed sources, configure `NOTION_API_KEY`, then verify a tagged Attempt and linked Session. |
| P0-6 | PR #36 CI `41417365846` and current stacked gate/build passed; local typecheck/build pass. | Deploy the branch after credentials are ready, then inspect authenticated `/drive/status` and `/notion/status`. |
| P0-7 | Full-gate/build runs `41465555192` and `41472444422` passed; PR #37 remains open and draft. | Add the five Notion variables and three Worker Secrets, deploy the weekly Cron, then verify a tagged Drive backup and read-back. |


## Current-session code and access check — 2026-11-02

- PR #37 was freshly checked: still open, draft, and unmerged. The code/test head is `2dfab885e7988d9f56081cb22f04a486328dfc9e`; run `41486421259` completed successfully, including `npm run test:gate` and `npm run build`.
- A backup export size guard now matches the import limit. The focused regression suite passed 7 tests; `npm test` passed 841 application and 53 Worker tests; typecheck, build (with a task-specific Wrangler config directory), and `git diff --check` passed locally.
- `npm run test:manual-gate` remains blocked by 18 pending physical-device/accessibility/manual acceptance checks recorded in `docs/testing/manual-acceptance.json`. This is separate from the green automated P0 CI gate.
- This session has GitHub access, but no control connected to the owner's local Chrome profile and no Cloudflare connector. No fresh Cloudflare/Google/Drive/Notion live check, secret inspection, account change, or deployment was performed in this session; earlier live observations above remain historical evidence.
- P0-3 through P0-7 remain in progress until their own owner-account OAuth/secret, deployment, and live read-back checks are completed. The referenced `CODEX_SYNC_AND_FEATURES _1_.md` is still absent, so no scope is inferred from it.


## بررسی زندهٔ تازه پس از اتصال Cloudflare MCP — ۱۴۰۵/۰۸/۱۱

این ثبت، وضعیت دسترسی را در بخش قبلی که Cloudflare MCP در دسترس نبود به‌روز می‌کند؛ تاریخچهٔ آن بخش مربوط به نشست پیشین است.

- PR #37 روی شاخهٔ `feat/p0-7-backup-restore` باز، draft و ادغام‌نشده است. commit فعلی `6f495c1b808c9e3ce1e5c6583670b7e9b39774c6` اجرای کامل `test:gate` و build را در CI `41493469737` با موفقیت گذراند.
- بررسی فقط‌خواندنی Cloudflare، Worker موجود `math-scratchpad-sync` را در Production و روی `workers.dev` نشان داد؛ نسخهٔ فعال `9d5c41bd-b338-45bb-b0bc-70c8129be568` است. binding موجود `EVENT_STORE` و متغیرهای پایهٔ `ALLOWED_ORIGIN`، `EVENT_RATE_LIMIT`، `GOOGLE_CLIENT_ID` و `OWNER_EMAIL` هستند.
- پنج متغیر `NOTION_DATA_SOURCE_ATTEMPTS`، `NOTION_DATA_SOURCE_SESSIONS`، `NOTION_DATA_SOURCE_MISTAKES`، `NOTION_DATA_SOURCE_CONCEPTS` و `NOTION_DATA_SOURCE_DAILY_REPORTS` در Production حاضر نیستند. نام هر سه Worker Secret لازم، `GOOGLE_DRIVE_CLIENT_SECRET`، `GOOGLE_DRIVE_REFRESH_TOKEN` و `NOTION_API_KEY` نیز در فهرست نیست؛ هیچ مقدار محرمانه‌ای خوانده نشد.
- هیچ Cron trigger، custom domain یا route برای Worker ثبت نیست؛ zone به نام `codevibe.ir` در حساب انتخاب‌شده یافت نشد. هیچ DNS، تنظیم Worker یا deployment تغییر نکرد.
- پاسخ `/health` در این نوبت از مسیر درخواست فقط‌خواندنی قابل تأیید نبود؛ گزارش HTTP 200 قبلی صرفاً سابقه است. در Google Drive فقط فراداده بررسی شد: `Math_Project/06_Backups` موجود است، ۱۵ مورد دارد و فایل `sync_backup_*.json` ندارد؛ `Math_Project/03_Sync` پیدا نشد. هیچ فایل یا رویداد آزمایشی نوشته یا read-back نشد.
- به‌دلیل نبود Secretها، deploy انجام نشد. وضعیت زندهٔ احرازشدهٔ Drive/Notion، backup زمان‌بندی‌شده و read-back واقعی همچنان لازم است؛ P0-3 تا P0-7 در حال انجام می‌مانند.


## بررسی ترتیبی تازهٔ Cloudflare، Google، Notion و Drive — ۱۴۰۵/۰۸/۱۱

- PR #37 روی head `89edf424e2783cfe2ac0db32c02a7c66c7868619` باز، draft و ادغام‌نشده است. اجرای CI `41499408955` با موفقیت کامل `test:gate` و `npm run build` را گذراند.
- شاخهٔ محلی درست است، اما HEAD محلی `2679f3f` از head PR عقب است و فایل‌های مستندات محلی تغییر دارند. hash هر ۱۱ فایل کد، تست و Worker/config تغییرکرده در PR با محتوای همان فایل‌ها در head فعلی یکی است؛ این checkout یک clone تمیز از commit جاری نیست.
- **Cloudflare:** MCP احراز است. Worker `math-scratchpad-sync` روی نسخهٔ فعال `9d5c41bd-b338-45bb-b0bc-70c8129be568` با ۱۰۰٪ ترافیک قرار دارد و workers.dev فعال است. bindingهای فعلی `EVENT_STORE` و چهار متغیر پایه‌اند؛ پنج `NOTION_DATA_SOURCE_*`، هر سه نام Secret لازم، و Cron در Production غایب‌اند. config شاخه Cron `0 2 * * 0` و پنج data source ID را دارد. health در این نوبت بررسی نشد.
- **Google OAuth:** پروژهٔ `math-scratchpad` و یک Web client موجودند؛ audience برابر External / Testing است. Branding پیوند Privacy و Terms ندارد؛ Data Access فقط `drive.file` نشان می‌دهد و `userinfo.email` که README Worker لازم می‌داند دیده نشد. کنترل‌های scope در UI کلیک‌پذیر نبودند؛ هیچ تنظیمی ذخیره و هیچ client secret/refresh token نمایش یا ساخته نشد.
- **Notion:** Developer Connections صفحهٔ «No connections yet» را نشان داد. ساخت connection مستلزم موافقت با Developer Terms است؛ فرم بسته شد و هیچ connection یا اشتراکی ساخته نشد. `NOTION_API_KEY` موجود نیست.
- **Drive:** حساب connector با مالک Worker تطبیق داشت. `Math_Project/06_Backups` با ۱۵ مورد موجود است ولی `sync_backup_*.json` ندارد؛ `Math_Project/03_Sync` در پوشهٔ پروژه پیدا نشد. فقط فراداده خوانده شد.
- هیچ Secret، Cron، route، دامنه، deployment، رویداد یا ردیف زنده تغییر نکرد. هیچ دادهٔ یادگیرنده‌ای خوانده یا نوشته نشد. P0-3 به لینک‌های عمومی، scope کامل و OAuth امن؛ P0-4 به Google Worker Secrets و Drive read-back؛ P0-5 به تصمیم مالک دربارهٔ Developer Terms، connection و اشتراک پنج source؛ P0-6 به deploy و status زنده؛ و P0-7 به deploy Cron و backup read-back مسدود می‌مانند.


## تأیید محلی پس از اتصال ابزارها — 2026-11-03

- روی checkout شاخهٔ `feat/p0-7-backup-restore`، `npm test` با ۸۴۱ تست برنامه (۵۷ فایل) و ۵۳ تست Worker (۳ فایل) موفق شد.
- `npm run test:typecheck -- --pretty false` موفق شد.
- `XDG_CONFIG_HOME=/tmp/math-scratchpad-xdg npm run build` موفق شد؛ app، standalone bundle و Wrangler dry-run ساخته شدند. هشدارهای اندازهٔ bundle و دستورهای `use client` وابستگی‌ها غیرمسدودکننده بودند.
- CI run `41513230008` روی head مستنداتی `082559193c62cd532c7dd23bfb0208bbd31814bf`، شامل `test:gate` و build، با موفقیت کامل شد. PR #37 همچنان باز و draft است.
- این آزمون‌ها deploy یا تغییر Production را انجام ندادند؛ live read-back مربوط به Drive/Notion و Cron همچنان انجام‌نشده است.


## Google OAuth scope update — 2026-11-03

- In the authenticated `math-scratchpad` Google Cloud project, `https://www.googleapis.com/auth/userinfo.email` was added and saved. A reload confirmed both `userinfo.email` and `drive.file` are present. No credential value was read or generated. Consent remains Testing; public privacy/terms links and Worker Secrets remain unresolved.
- CI run `41546783299` on documentation head `6d64c3aeea22ad548fc6862a442330379882fb4d` completed successfully, including gate and build.


## Notion integration setup — 2026-11-03

- With the owner's delegated authority, the single-workspace API-token connection `Math Scratchpad Sync` was created in Notion Developer; creating it accepted the displayed Developer Terms. Content access was saved for the five selected sources: Math Attempts, Sessions, Mistakes, Concepts, and Daily Reports. The access view showed five shared pages with those names. No Events database was selected.
- The integration credential was not displayed or retrieved. Cloudflare MCP secret-name listing remains empty; `NOTION_API_KEY` is not configured. No live Notion sync, Worker deployment, or Drive write/read-back occurred. OAuth Production and Google secrets remain outstanding.


## Fresh handoff audit — 2026-11-03 14:00 Asia/Tehran

- The connected Cloudflare identity is the personal owner account `amirhoseinlotfalizadeprogramer@gmail.com`, matching `OWNER_EMAIL`.
- Production Worker `math-scratchpad-sync` still routes 100% traffic to version `9d5c41bd-b338-45bb-b0bc-70c8129be568`. Its live bundle does not contain `/drive/status`, `/notion/status`, a scheduled handler, or `NOTION_DATA_SOURCE_ATTEMPTS`; it is still the P0-2 Worker, not the P0-3–P0-7 implementation.
- Production secret-name listing now shows `GOOGLE_DRIVE_CLIENT_SECRET` and `NOTION_API_KEY` (values were not read). `GOOGLE_DRIVE_REFRESH_TOKEN` is still absent.
- Production Worker settings still have only the base variables `ALLOWED_ORIGIN`, `EVENT_RATE_LIMIT`, `GOOGLE_CLIENT_ID`, and `OWNER_EMAIL`, plus the existing `EVENT_STORE` Durable Object binding. All five `NOTION_DATA_SOURCE_*` variables are absent.
- Production Cron schedule list is empty. The feature branch declares `0 2 * * 0`, but it was not installed because the currently active Worker does not contain the scheduled backup handler.
- The Worker subdomain is `math-scratchpad-redux`; the health endpoint could not be fetched through the available web retrieval path in this audit. No deploy or live data write/read-back was performed.
- The Drive project folder `Math_Project` contains `06_Backups`; no new `sync_backup_*.json` file has been verified. The Drive folder listing does not establish a live OAuth mirror.
- Notion workspace search can find Math Attempts and related project pages, but this is not evidence that the Worker integration token can write to the five configured data sources. No test row was created.
- Latest PR heads: #33 `60958b2728a79ac71660f53c97849ba30c9b0d1f` (CI run `41600838653` success); #37 `4b547d2ba768ef6dc637a78812e17018194d0971` (CI run `41609197095` success). PRs #34 and #36 currently report merge conflicts (`mergeable=false`) and no workflow run for their current heads. All five PRs remain open and draft; none has been merged.
- No Cloudflare Production configuration was changed in this audit. Do not enable Cron before deploying the code that implements its scheduled handler. Do not deploy the sync code until the missing Google refresh token and all required Notion/Drive bindings are configured and verified.


## Current execution status — 2026-11-03

- The current `main` includes the published Privacy Policy and Terms pages and their homepage links. Google OAuth Branding contains those public URLs; the owner account was added as a test user and the OAuth audience was switched to Production at the user's explicit request. Google still shows an unverified-app warning; this is not Google verification.
- The connected Notion workspace is the owner's personal workspace. All five target databases (Daily Reports, Math Attempts, Mistakes, Concepts, Sessions) and their data sources were successfully fetched through the ChatGPT Notion connector. This is not proof that the separate `Math Scratchpad Sync` Worker integration is shared. The authenticated KERNEL Notion session is open on Math Attempts; the share panel shows the owner with Full access. No successful addition of `Math Scratchpad Sync` to all five databases has been verified. No test row was created.
- Cloudflare Production Worker `math-scratchpad-sync` still routes 100% traffic to version `9d5c41bd-b338-45bb-b0bc-70c8129be568` (deployment `42e55f0a-dcfb-41f0-9ec4-f7e495057eeb`). Production has only `GOOGLE_DRIVE_CLIENT_SECRET` and `NOTION_API_KEY` secret bindings; `GOOGLE_DRIVE_REFRESH_TOKEN` is absent. Production vars still lack the five `NOTION_DATA_SOURCE_*` bindings. The production Cron list is empty. No production code/configuration was changed in this inspection.
- The P0-7 cumulative feature branch `feat/p0-7-backup-restore` already contains the five Notion data-source IDs and weekly Cron `0 2 * * 0` in `worker/wrangler.jsonc`, plus the P0-3 through P0-7 implementation. This configuration is not active in Production.
- PRs #33–#37 remain open and draft. Current mergeability: #33 dirty, #34 dirty, #35 clean, #36 dirty, #37 clean. The P0-7 head is `6d94fb3a44bd39d5982f9dcd25775b824db3552d`; run `41609197095` succeeded on a different earlier head (`4b547d2ba768ef6dc637a78812e17018194d0971`), so the current exact head still needs CI verification.
- The current `main` has three documentation/legal commits after the P0-2 base. The only overlapping file between that main delta and the cumulative P0-7 feature diff is `docs/PROGRESS.md`. The consolidation candidate branch preserves the current legal pages and merges the P0-7 progress record with this status section. No production deployment, Cron activation, or live Drive/Notion write/read-back has been performed.
