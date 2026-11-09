# معماری داده، ماندگاری و همگام‌سازی

**مبنا:** `main` @ `f670e01` — همهٔ موارد از کد استخراج شده است، نه از سند قدیمی.

## ۱. کلیدهای ذخیره‌سازی

| کلید | محتوا | محل | عبور از allowlist سرور |
|---|---|---|---|
| `math-scratchpad-session-v3` | Envelope v3: `session.doc`, `prefs`, `keyboardOpen`, `sync.revision`, `sync.writerId` | IndexedDB | بله (`SESSION_KEYS`) |
| `math-scratchpad-reading-position-v1` | موقعیت مطالعه (lesson/section/anchor/step/version) | IndexedDB | بله |
| `math-scratchpad-lesson-progress-v1:<bankId>:<version>` | پیشرفت درس، پاسخ چک‌ها، مراحل حل | IndexedDB | بله (prefix) |
| `math-scratchpad-last-open-lesson-v1:<bankId>:<version>` | آخرین درس بازشده | IndexedDB | بله (prefix) |
| `math-scratchpad:lesson-split-ratio` | نسبت پنل درس | IndexedDB | خیر (ترجیح محلی) |
| `math-scratchpad-draft-tab-v1` + `…-pending-draft-v1:<tab>` | ژورنال اضطراری همان تب | localStorage | خیر |

## ۲. قواعد اعتبارسنجی و نسخه

- `persistence.ts` فقط فیلدهای allowlist را بازسازی می‌کند؛ سند ناشناخته رد می‌شود.
- Envelope نسخهٔ ۳ دارد؛ نسخهٔ ۲ و v1 با مهاجرت خوانده می‌شوند.
- ذخیره با debounce ۸۰۰ms انجام می‌شود تا تایپ پیوسته، صف نوشتن را عقب نیندازد.
- تعارض بین تب‌ها به دیالوگ «Draft conflict» می‌رسد و کاربر انتخاب می‌کند؛ حذف خودکار وجود ندارد.

## ۳. Outbox و رویدادها

- رویداد یادگیری با Zod اعتبارسنجی و در IndexedDB صف می‌شود.
- حذف از outbox فقط بعد از ack همهٔ شناسه‌های یک batch.
- پاسخ HTTP موفق بدون ack کامل، batch را پاک نمی‌کند.
- `ActivityTracker` زمان فعال/پرت/متوقف را از یک مانیتور چرخهٔ عمر محاسبه می‌کند؛ idle پس از ۱۲۰ ثانیه.

## ۴. وضعیت سرور

- `ServerBackedStorage` کلیدهای مجاز را با `POST /state` و `revision` می‌فرستد.
- Worker در Durable Object با SQLite، `app_state` و event log را نگه می‌دارد.
- تعارض revision پاسخ ۴۰۹ می‌دهد؛ کلاینت فعلی آن را به «Reload» تبدیل می‌کند و rebase خودکار در این Adapter وجود ندارد (شکاف ثبت‌شده).

## ۵. Reading Checkpoint (پیاده‌سازی‌شده)

```ts
{
  userId, chapterId, lessonId, sectionId,
  contentAnchorId,   // "section:<id>" یا "concept:<id>"
  exerciseId, stepId,
  scrollOffset,      // فقط fallback محلی
  contentVersion,    // bank.version
  lastActivity, updatedAt
}
```

- نوشتن از رویداد موقعیت و از تغییر بخش در درس انجام می‌شود؛ آخرین timestamp برنده است.
- مصرف در UI: کارت «Continue learning» → `openLesson` + `LessonRestoreTarget` → انتخاب بخش و اسکرول یک‌باره به لنگر.
- بازیابی، Mathfield را فوکوس نمی‌کند و کیبورد را باز نمی‌کند.
- اگر `contentVersion` با بانک فعلی نخواند، پیشنهاد ادامه نمایش داده نمی‌شود.

## ۶. Mirror‌ها

- **Google Drive:** پوشهٔ `Math_Project`، مسیرهای `03_Sync/events`، `03_Sync/state`، `06_Backups`. نام فایل با Hash محتوا؛ پس از نوشتن، محتوا دوباره خوانده و با Hash مقایسه می‌شود؛ Update با ETag.
- **Notion:** projection برای Attempts، Sessions، Mistakes، Concepts، Daily Reports؛ idempotency از طریق شناسهٔ رویداد.
- هر دو **یک‌طرفه** از اپ به مقصد هستند؛ ویرایش دستی فایل در Drive به اپ برنمی‌گردد.
- موفقیت یک مقصد، موفقیت مقصد دیگر نیست.

## ۷. Reset و حذف

- `Reset current session`: دیالوگ تأیید + گزینهٔ دانلود بکاپ؛ فقط جلسهٔ جاری.
- `Reset all local storage`: فقط وقتی سرور فعال نیست؛ در حالت server-backed به پیش‌نمایش read-only تبدیل می‌شود.
- تعویض فصل: ابتدا snapshot تغییرناپذیر به Drive و Notion، سپس پاک‌سازی دادهٔ محلی همان فصل. در شکست، فصل جدید باز نمی‌شود و دادهٔ قبلی بازگردانده می‌شود.
- `MATH_QUESTION_BANK.json` و محتوای آموزشی هیچ‌گاه در این مسیرها حذف نمی‌شود.

## ۸. شکاف‌های شناخته‌شده

| شناسه | شکاف | وضعیت |
|---|---|---|
| SYNC-01 | ۴۰۹ بدون rebase خودکار | OPEN |
| SYNC-02 | تأیید واقعی Drive/Notion با حساب واقعی | BLOCKED |
| SYNC-03 | موقعیت مطالعه فقط با یک حساب؛ تست دو دستگاه | NOT ATTEMPTED |
| SYNC-04 | `last-open-lesson` در allowlist هست ولی اثر بین‌دستگاهی تست نشده | NEEDS TESTING |
