# ممیزی Design System

**مبنا:** `main` @ `f670e01` + برنچ `feat/resume-learning-a11y`
**قاعده:** هویت تأییدشدهٔ Dark Charcoal / Forest Green / Mint / Amber حفظ می‌شود؛ هیچ بازطراحی انجام نشد.

## ۱. زنجیرهٔ Token → Component → State

| Token | مقدار | مصرف‌کننده | وضعیت‌ها |
|---|---|---|---|
| `--color-background` | `#0a0a0a` | `.scratchpad`, body | ثابت |
| `--color-surface` / `--color-surface-elevated` | `#262626` / `#404040` | کارت Step، منو، پنل‌ها | ثابت |
| `--color-text-primary` / `-secondary` / `-muted` | `#fafafa` / `#a3a3a3` / `#737373` | متن UI | ثابت |
| `--color-primary` / `-hover` / `-active` | `#34d399` / `#6ee7b7` / `#10b981` | دکمهٔ اصلی، انتخاب ساختار | hover، active، disabled |
| `--color-warning` | `#f59e0b` | «Needs review»، هشدار فرمول | ثابت |
| `--color-error` / `-400` | `#ef4444` / `#f87171` | خطا، Danger | متن روی سطح تیره با `-400` |
| `--border` / `--border-strong` | `#404040` / `#525252` | کارت، ورودی، Tab strip | focus با `--ring` |
| `--ring` | `#34d399` | focus-visible | — |
| `--space-1..12` | 4px → 48px | فاصله‌گذاری | — |
| `--radius-sm..2xl` | 4 → 16px | کنترل و کارت | — |
| `--breakpoint-*` | 320…1920 | فقط مقدار؛ در `@media` قابل استفاده نیست | — |

**Component → Variant → State** (نمونه‌های کلیدی):

| Component | Variants | States |
|---|---|---|
| `.ui-button` (Radix Slot + cva) | default، outline، ghost، danger؛ icon، sm | hover، active، focus-visible، disabled |
| `.lesson-pane-tab` | — | `aria-selected=true`، focus-visible (افزوده‌شده) |
| `.lesson-split-handle` | — | hover، focus-visible، drag |
| `.continue-learning` (جدید) | — | ثابت؛ CTA با `variant=default` |
| `.step` | active، edited، needs-review، final | ۴ حالت مستقل با متن، نه فقط رنگ |

## ۲. ناهماهنگی‌های شناسایی‌شده

| شناسه | مورد | شاهد | پیشنهاد |
|---|---|---|---|
| DS-01 | دو لایهٔ توکن موازی: `design-tokens.css` (معنایی) و `tokens.css` (alias قدیمی `--ms-*`) | `styles.css` هر دو را مصرف می‌کند (مثلاً `.menu-panel`, `.setup-panel`) | حذف تدریجی aliasها فقط پس از شمارش مصرف‌کننده؛ در این برنچ دست نخورد |
| DS-02 | رنگ خطا در دو سطح: `--color-error` و `--color-error-400` | `PR #72` متن خطا را به `-400` برد (کنتراست بهتر) | قاعده: متن روی `--color-surface` همیشه `-400` |
| DS-03 | Radius واقعی UI با توکن یکی نیست | کارت‌ها ۱۰/۱۲/۱۴/۱۸px، توکن‌ها ۴–۱۶px | افزودن `--radius-card: 12px` و `--radius-step: 18px` |
| DS-04 | Rhythm: سند ۸px می‌گوید، مقیاس ۴px است | `design-tokens.css` | تثبیت ۴px به‌عنوان زیرواحد و ۸px به‌عنوان ریتم اصلی در سند |
| DS-05 | Breakpointها در CSS Variable هستند ولی در `@media`/`@container` قابل استفاده نیستند | `SPLIT_MEDIA_QUERY = '(min-width: 1100px)'` عددی نوشته شده | نگه‌داشتن عدد در یک منبع و تست برابری (در `lesson-work-items.ts` توضیح داده شده) |
| DS-06 | دو مفهوم Layout مستقل: workspace (900/1600) و split (1100) | `use-workspace-layout.ts` | جدول تصمیم رسمی در `docs/architecture.md` ثبت شد |
| DS-07 | ارتفاع Tab پنل درس ۴۰px در برابر هدف ۴۴/۴۸ | `.lesson-pane-tab { min-height: 40px }` | افزایش به ۴۴px در تغییر بعدی (نیازمند بازبینی چیدمان نوار) |

## ۳. تغییرات بصری این برنچ

- کارت «Continue learning»: تنها با توکن‌های موجود (`--card`, `--border`, `--muted-foreground`, `--foreground`) و بدون رنگ جدید.
- کنترل عرض پنل: pill با `--card` و `--border`؛ آیکون‌های Lucide با `aria-label` و `title`.
- `scroll-margin-block-start` برای عنوان بخش در حالت Tab.

هیچ فونت، سایه یا رنگ تازه‌ای اضافه نشد و هیچ `!important` جدیدی نوشته نشد.
