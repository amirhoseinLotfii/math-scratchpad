# ادامهٔ مطالعه و دسترس‌پذیری پنل درس — ۲۰۲۶-۱۱-۰۹

**برنچ:** `feat/resume-learning-a11y` (از `main` @ `f670e019`)
**یادداشت بازسازی:** نسخهٔ اول این کار روی `85a2e4e` بود. سپس `main` واقعی fetch شد که PR #72 (رفع حلقهٔ رندر Reading Position + تست رگرسیون) را دارد؛ کار روی همان مبنا بازسازی شد و رفع تکراری حذف گردید.
**اعداد مرجع گیت‌ها:** نتایج نهایی و به‌روز در `docs/qa/MATH_SCRATCHPAD_MASTER_QA_REPORT.md` ثبت شده است؛ اعداد این سند مربوط به اجرای تاریخی روی مبنای قبلی است.
**دامنه:** تکمیل شکاف‌های باقی‌مانده از گزارش ۲۰۲۶-۱۱-۰۸ و ممیزی تعاملی؛ بدون بازنویسی معماری، بدون حذف یا تغییر دادهٔ کاربر.

## ۱. وضعیت پایه در برابر گزارش قبلی

گزارش تحقیق روی `b7215e3` نوشته شده بود. روی `main` (پیش از تغییرات این برنچ) این موارد **از قبل رفع شده بودند** و دوباره اندازه‌گیری شدند:

| ادعای گزارش | وضعیت اندازه‌گیری‌شده |
|---|---|
| ۱۹ خطای TypeScript | صفر؛ `npm run test:typecheck` موفق |
| تست معماری به‌دلیل نام فایل PascalCase | موفق؛ فایل‌ها kebab-case هستند |
| `var()` در شرط `@media`/`@container` | وجود ندارد؛ تنها کاربرد باقی‌مانده `max-width: var(...)` است که معتبر است |
| `SPLIT_MEDIA_QUERY` نامعتبر | مقدار فعلی `(min-width: 1100px)` |
| `data-anchor-id` در رندرر درس | تولید می‌شود (`sectionAnchorId` / `conceptAnchorId`) |
| Reading Position روی mock/BroadcastChannel | به learning storage و سینک سرور احراز هویت‌شده وصل است |
| PR #71 باز و ادغام‌نشده | ادغام شده؛ `pr-71` زیرمجموعهٔ `main` است |

## ۲. شکاف‌هایی که در این برنچ بسته شدند

| شناسه | مشکل | اصلاح |
|---|---|---|
| BUG-005 | `ContinueLearningButton` بدون `onClick` و رندرشده نشده بود | کامپوننت به یک کنترل نمایشی با `onResume` تبدیل شد و در `App` روی صفحهٔ اصلی رندر می‌شود |
| BUG-003 | بازیابی موقعیت به درس وصل نبود | `LessonScreen` هدف بازیابی (`sectionId` / `contentAnchorId` / `scrollOffset`) را می‌پذیرد، بخش ذخیره‌شده را باز می‌کند و یک‌بار به لنگر اسکرول می‌کند |
| BUG-009 (جدید) | حلقهٔ بی‌پایان رندر: Provider در هر رندر آبجکت تازه به context می‌داد و افکت ردیابی درس‌نامه به همان آبجکت وابسته بود | انتخاب‌گر در Zustand، `useCallback` برای نویسنده‌ها و `useMemo` برای مقدار context؛ وابستگی افکت به تابع پایدار |
| BUG-010 (جدید) | عنوان بخشِ فوکوس‌شده زیر نوار Tab چسبان پنهان می‌شد (WCAG 2.2 / 2.4.11) | `scroll-margin-block-start` برای عنوان بخش در حالت Tab |
| — | Tabs درس‌نامه الگوی APG را کامل نداشت | roving `tabIndex`، ArrowLeft/Right (آگاه به RTL)، Home/End، مدیریت فوکوس، `aria-controls` فقط برای پنل موجود |
| — | Split handle فقط Drag و کیبورد داشت (WCAG 2.2 / 2.5.7) | دو دکمهٔ ۴۴×۴۴ برای باریک/پهن‌کردن پنل، با `aria-label` و `title` |

## ۳. فایل‌های تغییر‌یافته

- `src/features/progress/reading-position-context.tsx` — مقدار context پایدار، `ContinueLearningButton` با ناوبری
- `src/features/lessons/lesson-screen.tsx` — هدف بازیابی، اسکرول یک‌بارهٔ لنگر، Tabs دسترس‌پذیر، کنترل عرض پنل
- `src/App.tsx` — ساخت گزینهٔ «ادامهٔ مطالعه» از موقعیت ذخیره‌شده، عبور هدف بازیابی به درس
- `src/styles.css` — کارت ادامهٔ مطالعه، کنترل عرض پنل، `scroll-margin` عنوان
- `e2e/fixtures/lesson-connected-preview.tsx` — افزودن `ReadingPositionProvider` تا پیش‌نمایش با پوستهٔ `main.tsx` یکی باشد
- `tests/integration/lesson-resume-a11y.test.tsx` — تست‌های جدید
- `tests/integration/lesson-phase4.test.tsx` — سقف زمانی واقع‌گرایانه‌تر (۱۵s → ۳۰s) برای سفر طولانی UI
- `vitest.config.ts` — `testTimeout` سراسری ۲۰s

## ۴. رفتار قابل انتظار

1. با ورود به یک درس، بخش جاری در learning storage ذخیره می‌شود.
2. پس از بازگشت به صفحهٔ اصلی، کارت «Continue learning» با عنوان درس، عنوان بخش و شمارهٔ بخش نمایش داده می‌شود؛ در آزمون تشخیصی و تمرین درس پنهان می‌ماند.
3. «Resume lesson» همان درس را باز می‌کند و بخش ذخیره‌شده را فعال می‌کند.
4. بازیابی فقط اسکرول می‌کند؛ Mathfield فوکوس نمی‌شود و کیبورد باز نمی‌شود.
5. اگر نسخهٔ بانک با موقعیت ذخیره‌شده نخواند، کارت نمایش داده نمی‌شود (بدون بازیابی کورکورانه).

## ۵. شواهد اجرا

| بررسی | دستور | نتیجه |
|---|---|---|
| TypeScript اپ، تست‌ها و worker | `npm run test:typecheck` | PASS |
| واحد | `npm run test:unit` | ۲۹۸ تست PASS |
| یکپارچه | `npm run test:integration` | ۱۷۲ از ۱۷۳ در اجرای هم‌زمان با بار موازی؛ تنها شکست، تایم‌اوت ۲۰s در `lesson-phase3` بود که در اجرای تنها با همان کد پاس شده بود |
| دسترس‌پذیری | `npm run test:a11y` | ۳۳ از ۳۴؛ یک تایم‌اوت ۲۰s در `forms-and-menus` زیر همان بار موازی |
| UX | `npm run test:ux` | ۴۳ تست PASS |
| تست‌های هدفمند این برنچ | `npx vitest run tests/integration/lesson-resume-a11y.test.tsx tests/integration/lesson-split-view.test.tsx tests/architecture` | ۱۳ تست PASS |
| Playwright — ادامهٔ مطالعه و Tabs | `npx playwright test e2e/lessons/resume-learning.spec.ts --project=mobile-390` | ۲ تست PASS (۱۵.۹s و ۶.۲s) |
| Playwright — کنترل عرض پنل | `npx playwright test e2e/wide/split-resize-controls.spec.ts --project=laptop-1440` | PASS (۱۰.۷s) |
| Playwright — جای کیبورد (موجود) | `npx playwright test e2e/lessons/keyboard-placement-regression.spec.ts --project=mobile-390` | PASS (۱۵.۸s) در اجرای تنها |
| Playwright — Split keyboard (موجود) | `npx playwright test e2e/wide/keyboard-adjacent-audit.spec.ts --project=laptop-1440` | PASS (۱۴.۶s) |
| ساخت تولید | `npm run build` | PASS — typecheck، ۲۱۱۵ ماژول، `dist/standalone.html` (۲.۶۶MB) و dry-run ورکر |

**دربارهٔ تایم‌اوت‌ها:** در اجرای هم‌زمان چند مجموعه، دو تست Vitest و یک تست Playwright به سقف زمانی خود رسیدند و در اجرای تنها با همان کد پاس شدند. علت، رقابت منابع روی این ماشین بود، نه شکست منطق؛ برای همین سقف زمانی تست سفر طولانی `lesson-phase4` به ۳۰ ثانیه و سقف سراسری Vitest به ۲۰ ثانیه رسید.

### بررسی مرورگری (Chrome، سرور توسعهٔ محلی)

- `1440×900`: حالت Split، دو دکمهٔ عرض پنل، کارت «Continue learning» بعد از بازگشت از درس و بعد از reload، و باز شدن دوبارهٔ درس در «Section 1 of 2» بدون فوکوس روی Mathfield.
- `390×844`: کارت ادامهٔ مطالعه در یک ستون، Tabs با `tabindex` 0/-1 و `aria-controls` فقط برای پنل موجود، عدم وجود overflow افقی، و پنهان‌بودن کنترل عرض پنل.

## ۶. اجرا نشده / باقی‌مانده

- کل مجموعهٔ `npm run test:e2e` اجرا نشد؛ فقط چهار spec مرتبط (دو spec جدید و دو spec موجود کیبورد) روی `mobile-390` و `laptop-1440` اجرا شدند. ماتریس کامل (۳۲۰/۴۳۰/۱۰۲۴/۱۹۲۰/۲۵۶۰ و Firefox/WebKit) اجرا نشده است.
- `e2e/lessons/keyboard-adjacent-audit.spec.ts` در این نشست اجرا نشد.
- **Cross-device واقعی** (دو دستگاه با حساب Google یکسان) نیازمند اجرای دستی است؛ در این محیط تأیید نشد.
- تست دستی دستگاه واقعی Android/iOS، TalkBack/VoiceOver و رفتار OSK همچنان باز است.
- `last-open-lesson` اکنون در allowlist سینک است، اما اثر آن روی سینک بین‌دستگاهی تست نشده.
- امکان Drag روی handle با `pointercancel` پوشش داده نشده؛ دکمه‌های جایگزین اضافه شده‌اند.

## ۷. بازگردانی

همهٔ تغییرات در یک کامیت روی برنچ `fix/resume-learning-a11y` است. برای بازگشت: `git checkout main`. هیچ دادهٔ IndexedDB، Google Drive یا Notion در این نشست حذف یا بازنویسی نشد.
