# گزارش جامع QA — Math Scratchpad

**تاریخ:** ۲۰۲۶-۱۱-۰۹
**مبنای بررسی:** `main` روی `f670e019` (Merge PR #72) — به‌صورت واقعی fetch شد، نه از گزارش قبلی
**برنچ کار:** `feat/resume-learning-a11y`
**دستورهای اجراشده در همین محیط:** Vitest، Playwright (Chromium)، Vite build، wrangler dry-run

---

## ۱. خلاصهٔ اجرایی

سه چیز در این بررسی روشن شد:

1. بخش بزرگی از فهرست P0/P1 قبلی **قبلاً روی `main` رفع شده بود** (TypeScript، نام‌گذاری فایل‌ها، `SPLIT_MEDIA_QUERY`، لنگرهای معنایی، حلقهٔ رندر Reading Position). ادعای «۱۹ خطای TypeScript» یا «PR #71 باز» دیگر معتبر نیست.
2. شکاف واقعی باقی‌مانده، **«ادامه از آخرین نقطه»** بود: کامپوننتش وجود داشت ولی بدون ناوبری و بدون محل رندر. همچنین Restore به درس وصل نبود. این‌ها بسته شد.
3. سه یافتهٔ P1 در بازآزمایی **بازتولید نشدند** (همپوشانی Math Tools، چند کیبورد هم‌زمان، جابه‌جایی صفحه با New Problem). این‌ها در جدول با وضعیت `NOT REPRODUCIBLE` ثبت شده‌اند، نه «رفع‌شده».

---

## ۲. باسلاین

| مورد | مقدار واقعی |
|---|---|
| `origin/main` | `f670e019144c1ed05069beb88d7fd980718934fc` — ۸ نوامبر ۲۰۲۶ |
| کامیت محلی قبلی | `85a2e4e` (عقب‌تر از main، بدون PR #72) |
| PRهای باز روی مخزن | #76، #75، #74، #73، #44، #43، #26، #8، #7 و ۱۰ مورد dependabot |
| PR #71 | ادغام‌شده (در فهرست باز نیست) |
| PR #72 | ادغام‌شده؛ همان رفع حلقهٔ رندر Reading Position با تست `tests/unit/reading-position-context.test.tsx` |
| وضعیت CI/GitHub Actions | **BLOCKED** — دسترسی به لاگ Actions در این محیط ممکن نشد؛ هیچ عددی از CI نقل نمی‌شود |
| Deploy | **NOT ATTEMPTED** — انتشار از این محیط انجام نشد |

**نتیجهٔ مهم:** درمان حلقهٔ رندر که در نسخهٔ قبلی این کار مستقل کشف شده بود، در `main` وجود دارد. کار جدید روی همان `main` بازسازی شد تا رفع تکراری و تداخل ایجاد نکند.

---

## ۳. معماری واقعی (و اصلاح Drift مستندات)

`docs/architecture.md` می‌گفت Redux Toolkit منبع حقیقت است؛ این غلط بود. اکنون اصلاح شد:

```
User Action → Store (Zustand, AST) → Learning Storage (IndexedDB, allowlisted keys)
             → Event Outbox → Cloudflare Worker (Durable Object, revisioned /state)
             → Mirrors: Google Drive و Notion (یک‌طرفه، تغییرناپذیر، تأییدشده)
```

| لایه | ماژول | مسئولیت |
|---|---|---|
| Store | `features/math-editor/store/editor-store.ts` | AST، Cursor، Undo/Redo، prefs |
| Session Persistence | `features/session/persistence/persistent-store.ts` | کلید v3، debounce ۸۰۰ms، ژورنال per-tab |
| Learning Storage | `sync/browser-db.ts` | IndexedDB + allowlist + BroadcastChannel |
| Outbox | `sync/events.ts`، `sync/runtime.ts` | رویدادها تا ack سرور |
| Server State | `sync/server-storage.ts`، `worker/src/event-store.ts` | `/state` با revision و ۴۰۹ |
| Mirrors | `worker/src/google-drive.ts`، `worker/src/notion-mirror.ts` | Snapshot تأییدشده |

همچنین `CONTRIBUTING.md` (اشاره به Redux) و پاراگراف Sync در `README.md` اصلاح شدند.

---

## ۴. موجودی سطوح و تعاملات (خلاصه)

سطوح واقعی که بررسی شدند: App/Exercise Home، هدر و منو، Practice 30/20، Question Navigator، Lesson Picker، Lesson Screen، Worked Example، Inline Check، Your Work، Math Editor، Math Keyboard، Symbols، Insert Math Element، Confidence، Completion، New Problem، Backup/Session JSON، Cloud Sync Panel، Drive Bank، Danger Zone، Privacy، Terms.

جزئیات ماشین‌خوان در `docs/qa/interaction-matrix.json` (۲۴ تعامل با شناسه، وضعیت اولیه، رخداد، نتیجهٔ انتظاری و وضعیت تأیید).

---

## ۵. یافته‌ها

### ۵.۱. اصلاح‌شده در این کار (با تست)

| شناسه | مشکل | اصلاح | تست |
|---|---|---|---|
| RES-001 | `ContinueLearningButton` بدون `onClick` و رندرنشده | کنترل نمایشی با `onResume`؛ رندر روی صفحهٔ اصلی با عنوان درس/بخش و شمارهٔ بخش | `tests/integration/lesson-resume-a11y.test.tsx` (۴ تست) + `e2e/lessons/resume-learning.spec.ts` |
| RES-002 | بازیابی موقعیت به درس وصل نبود | `LessonScreen` هدف بازیابی (`sectionId`/`contentAnchorId`/`scrollOffset`) می‌گیرد؛ بخش ذخیره‌شده انتخاب و یک‌بار اسکرول می‌شود؛ بدون فوکوس Mathfield و بدون باز شدن کیبورد | همان تست‌ها + تأیید مرورگری |
| A11Y-001 | Tabs درس الگوی APG را کامل نداشت | roving `tabIndex`، ArrowLeft/Right آگاه به RTL، Home/End، مدیریت فوکوس، `aria-controls` فقط برای پنل موجود | تست یکپارچه + spec |
| A11Y-002 | Split فقط Drag و کیبورد داشت (WCAG 2.5.7) | دو دکمهٔ ۴۴×۴۴ «باریک‌تر/پهن‌تر» در گوشهٔ هدر پنل درس | `e2e/wide/split-resize-controls.spec.ts` |
| A11Y-003 | عنوان بخشِ فوکوس‌شده زیر نوار Tab چسبان پنهان می‌شد (2.4.11) | `scroll-margin-block-start` برای عنوان و لنگر بخش در حالت Tab | اندازه‌گیری: عنوان از ۴۱px به ۱۰۵px (زیر نوار ۵۶px) منتقل شد |
| DOC-001 | Drift مستندات (Redux vs Zustand، توصیف نادرست Sync) | `docs/architecture.md`، `CONTRIBUTING.md`، `README.md` | — |
| TEST-001 | شکنندگی تایم‌اوت در سفر طولانی UI | سقف `lesson-phase4` از ۱۵s به ۳۰s و `testTimeout` سراسری ۲۰s (بدون تغییر assertion) | اجرای مجدد |

### ۵.۲. بازآزمایی‌شده و **بازتولید نشده**

| شناسه | ادعای قبلی | اندازه‌گیری امروز | وضعیت |
|---|---|---|---|
| UX-01 | همپوشانی More Math Tools با Parentheses/Root/Power | در ۹۰۰/۱۰۲۴/۱۱۰۰/۱۲۸۰ هیچ جفت دکمه‌ای همپوشانی ندارد؛ `scrollWidth - clientWidth = 0` | NOT REPRODUCIBLE |
| UX-03 | چند کیبورد هم‌زمان | در ۳۲۰/۳۹۰/۴۳۰/۷۶۸ تعداد `.math-keyboard` همیشه ۱ | NOT REPRODUCIBLE |
| UX-08 | جابه‌جایی ~۳۶۹px با New Problem | تغییر موقعیت `.scratchpad` و `scrollY` برابر ۰ | NOT REPRODUCIBLE |
| UX-04 | کارت‌های بستهٔ حجیم | کارت‌های غیرفعال ۱۳۴px؛ کارت فعال ۵۸۳–۸۵۰px | PARTIAL — کارت اول با باز شدن درس از پیش باز است |

### ۵.۳. باز (بدون تغییر در این برنچ)

| شناسه | مشکل | شدت | دلیل باز ماندن |
|---|---|---|---|
| UX-02 | در ۳۲۰×۵۶۸ فقط ۱۱۶px از ۲۵۸px کیبورد دیده می‌شود | P2 | ردیف اول کلیدها (۴۸px) قابل استفاده است؛ بهبود نیاز به بازطراحی ارتفاع کارت دارد |
| UX-09 | منوی بلند با ۲۱ گزینه | P2 | PR #73/#76 روی همین ناحیه کار می‌کنند؛ تداخل عمدی نشد |
| A11Y-CONTRAST | کنتراست حاشیهٔ New Problem | P2 | PR #75 باز است؛ تغییر موازی باعث conflict می‌شد |
| AUTH-TABS | ورود Google بین تب‌ها | P1 | PR #74 باز است |
| MENUS-MOBILE | منوهای تودرتوی موبایل | P1 | PR #73/#76 باز است |

### ۵.۴. بلاک‌شده در این محیط

- CI و GitHub Actions، وضعیت checks هر PR، و Pages/Worker deployment → **BLOCKED** (بدون دسترسی/اعتبارنامه در این محیط).
- Google OAuth واقعی، انتخاب فایل Drive، نوشتن در Notion → **BLOCKED** (نیازمند حساب کاربر و توکن واقعی؛ هیچ Mock به‌عنوان موفقیت گزارش نمی‌شود).
- TalkBack/VoiceOver/NVDA، کیبورد فیزیکی Android، Safe Area روی دستگاه → **NEEDS DEVICE TESTING**.
- Cross-device واقعی (دو دستگاه، یک حساب) → **NOT ATTEMPTED**.

---

## ۶. ماتریس ریسپانسیو (اندازه‌گیری‌شده)

| Viewport | Layout | Math Tools overlap | Keyboard visible / total | First key row | Overflow X |
|---|---|---:|---:|---:|---:|
| 320×568 | phone | — | 116 / 258 px | 48px کامل | 0 |
| 390×640 | phone | — | 258 / 258 px | 48px کامل | 0 |
| 390×844 | phone | — | 258 / 258 px | 48px کامل | 0 |
| 430×932 | phone | — | 258 / 258 px | 48px کامل | 0 |
| 768×1024 | tablet | — | 265 / 265 px | 48px کامل | 0 |
| 900×900 | laptop | 0 همپوشانی | — | — | 0 |
| 1024×768 | laptop | 0 | — | — | 0 |
| 1100×900 | laptop + Split | 0 | — | — | 0 |
| 1280×800 | laptop | 0 | — | — | 0 |
| 1440×900 | desktop Split | 0 | — | — | 0 |

عرض‌های ۶۰۰، ۸۲۰، ۱۵۹۹، ۱۶۰۰، ۱۹۲۰، ۲۵۶۰ و زوم ۲۰۰٪/۴۰۰٪ در این نشست اندازه‌گیری نشدند.

---

## ۷. دسترس‌پذیری

- تست خودکار: `npm run test:a11y` (axe + semantics) اجرا شد و نتایج در بخش ۹ ثبت است.
- اصلاح‌های این برنچ: الگوی کامل Tabs، جایگزین Pointer بدون Drag برای Split، و Focus Not Obscured.
- آزمون دستی صفحه‌خوان و دستگاه فیزیکی انجام نشده و «قبول» اعلام نمی‌شود.
- تفکیک سطوح: هدف داخلی ۴۴×۴۸ از WCAG AAA (Target Size Enhanced) فراتر است؛ حداقل AA برابر ۲۴×۲۴ است و این دو یکی نیستند.

---

## ۸. کارایی (اندازه‌گیری‌شده)

| سنجه | مقدار | شرط |
|---|---|---|
| Vite production build | ۳.۰۳s، ۲۱۱۵ ماژول | `npm run build` روی این ماشین |
| Bundle اصلی | ۱٬۶۳۴.۸۴ kB (gzip ۴۷۶.۴۲ kB) | تولید |
| `dist/standalone.html` | ۲٬۶۵۹٬۳۲۶ بایت | تولید |
| CLS | ۰.۰۰۱ – ۰.۰۱۲ | چند مسیر در Chromium محلی |
| TTFB محلی | ۷–۸۰ms | سرور توسعه |

عدد LCP/INP سرور واقعی اندازه‌گیری نشد و گزارش نمی‌شود.

---

## ۹. گیت‌های اجراشده

| دستور | نتیجه |
|---|---|
| `npm run test:typecheck` | PASS |
| `npx vitest run tests/integration/lesson-resume-a11y.test.tsx tests/integration/lesson-split-view.test.tsx tests/unit/reading-position-context.test.tsx tests/architecture` | ۱۴/۱۴ PASS |
| `npm run build` | PASS (typecheck + build + standalone + wrangler dry-run) |
| `npm run test:unit` | ۲۹۹/۲۹۹ PASS (۳۰ فایل) |
| `npm run test:integration` | ۱۷۳/۱۷۳ PASS (۱۹ فایل) |
| `npm run test:a11y` | ۳۴/۳۴ PASS |
| `npm run test:ux` | ۴۳/۴۳ PASS |
| Playwright: `resume-learning` + `split-resize-controls` + `keyboard-placement-regression` روی mobile-390 و laptop-1440 | ۴/۴ PASS در ۴۶.۵s |
| ساخت مجدد پس از بازسازی روی main | PASS — `built in 5.07s`، JS ۱٬۶۳۴.۹۱ kB (gzip ۴۷۶.۴۳)، standalone ۲٬۶۵۹٬۴۰۷ بایت |

**نکتهٔ اندازه‌گیری:** در اجرای سریالی و بدون بار موازی، تست `lesson-phase4` در ۲.۸ ثانیه پاس شد؛ همان تست در اجرای هم‌زمان تا ۱۵+ ثانیه می‌رسید. بنابراین تایم‌اوت‌های قبلی ناشی از رقابت منابع بود، نه نقص محصول — و هیچ assertion‌ای برای سبز شدن تضعیف نشد.

---

## ۱۰. ماتریس وضعیت نهایی

| مورد | وضعیت |
|---|---|
| ادامه از آخرین نقطه (CTA + ناوبری) | VERIFIED (تست + مرورگر) |
| بازیابی بخش/لنگر در درس | VERIFIED (تست + مرورگر) |
| Tabs دسترس‌پذیر | VERIFIED |
| کنترل غیردرگ Split | VERIFIED |
| Focus Not Obscured | VERIFIED |
| حلقهٔ رندر Reading Position | VERIFIED upstream (تست رگرسیون در main) |
| Drift مستندات معماری | VERIFIED |
| UX-01 / UX-03 / UX-08 | NOT REPRODUCIBLE |
| UX-02 / UX-04 / UX-09 | OPEN (P2) |
| کنتراست فرم‌ها | OPEN — PR #75 |
| منوی موبایل / احراز هویت تب‌ها | OPEN — PR #73/#74/#76 |
| CI / Deploy / Production smoke | BLOCKED / NOT ATTEMPTED |
| Drive / Notion واقعی | BLOCKED |
| صفحه‌خوان و دستگاه فیزیکی | NEEDS DEVICE TESTING |
| Cross-device واقعی | NOT ATTEMPTED |

**بیانیهٔ صراحت:** این گزارش ادعای انتشار یا سبز بودن CI کامل ندارد. هیچ اسکرین‌شات ساختگی تولید نشده و هر عدد از اجرای واقعی در همین محیط آمده است.

---

## ۱۱. تحویل

| مورد | مقدار |
|---|---|
| برنچ | `feat/resume-learning-a11y` (از `origin/main` @ `f670e01`) |
| کامیت | `b87a7d4` — ۱۹ فایل، ۱٬۱۱۱ افزوده، ۴۷ حذف |
| Push | انجام شد؛ برنچ روی `origin` ساخته شد |
| PR | ساخته نشد (نیازمند توکن GitHub در این محیط) — لینک ساخت: `https://github.com/amirhoseinLotfii/math-scratchpad/pull/new/feat/resume-learning-a11y` |
| CI روی برنچ | **BLOCKED** — اجرای Actions در این محیط قابل مشاهده نیست |
| Deploy | **NOT ATTEMPTED** |
| Rollback | `git checkout main` یا بستن PR؛ هیچ داده‌ای از IndexedDB/Drive/Notion در این نشست حذف نشد |

### وضعیت Publish و Production (اندازه‌گیری‌شده)

| پرسش | پاسخ |
|---|---|
| آیا برنچ push شد؟ | بله — `origin/feat/resume-learning-a11y` روی `477091c` |
| آیا merge به `main` شد؟ | بله — merge commit `30c8416` (با تأیید صریح کارفرما) و push به `origin/main` |
| آیا تغییرات منتشر شد؟ | بله — Pages در ساعت ۱۲:۳۶:۱۹ نسخهٔ جدید را سرو کرد |
| Production چه نسخه‌ای دارد؟ | `index-5H0ZUv2G.js` + `index-5M5PTG1A.css` — دقیقاً همان خروجی build کامیت `30c8416` |
| آیا کد جدید در باندل منتشرشده هست؟ | بله — `Continue learning`، `.continue-learning`، `Narrower lesson panel`، `.lesson-split-size-controls`، `lesson-panel-lesson` همه در JS/CSS سرو‌شده یافت شدند |
| آیا کارت ادامهٔ مطالعه در Production دیده می‌شود؟ | نه — چون بانکی بارگذاری نشده و موقعیت ذخیره‌شده‌ای نیست؛ شرط نمایش درست کار می‌کند |

**Smoke test روی Production جدید:** بارگذاری بدون خطای کنسول و بدون درخواست ناموفق، TTFB ۲۲۱ms، CLS ۰٫۰۰۱، منوی تمرین با ۷ آیتم، Escape فوکوس را به دکمهٔ منو برمی‌گرداند، دیالوگ «Lessons» با پیام «No question bank is loaded…» باز می‌شود و `Escape` فوکوس را بازمی‌گرداند.

**آنچه روی Production قابل آزمون نبود:** مسیر کامل «درس → بازگشت → کارت Continue → Resume» به بانک سؤال نیاز دارد که فقط با ورود حساب Google و انتخاب فایل Drive ممکن است؛ در این محیط حساب کاربری وجود ندارد. این مورد `BLOCKED` است و تستش با حساب شخصی خودِ کارفرما لازم است.

### فایل‌های تغییر‌یافته

```
src/App.tsx
src/features/lessons/lesson-screen.tsx
src/features/progress/reading-position-context.tsx
src/styles.css
vitest.config.ts
tests/integration/lesson-resume-a11y.test.tsx      (جدید)
tests/integration/lesson-phase4.test.tsx          (سقف زمانی)
e2e/fixtures/lesson-connected-preview.tsx         (Provider هم‌سطح main.tsx)
e2e/lessons/resume-learning.spec.ts               (جدید)
e2e/wide/split-resize-controls.spec.ts            (جدید)
docs/architecture.md · CONTRIBUTING.md · README.md
docs/qa/MATH_SCRATCHPAD_MASTER_QA_REPORT.md · interaction-matrix.json
docs/qa/DESIGN_SYSTEM_AUDIT.md · DATA_SYNC_ARCHITECTURE.md
docs/qa/RESUME_AND_A11Y_2026-11-09.md · LOGIC_BUG_REGISTER.md
```
