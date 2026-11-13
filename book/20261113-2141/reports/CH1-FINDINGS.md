# Chapter 1 v21 — Findings

- RUN_ID: `20261113-2141`
- Bank: Chapter 1 `v21`, read-only; no edits made.
- Validator: connected to repository `parseBankText`, `validateBank`, and `parseLessons` from clean `main` at `7eeeef0bf7d524323f88e3520484dfd3a0f7a7bf`.
- App parse: `VERIFIED`; `parseBankText` warnings `0`; `parseLessons` warnings `0`.
- Template-audit exit: `0`. Existing template defects are reported as baseline findings; bank-size limit is the sole `WARNING` (not fatal for this v21 audit).
- Size: `1,183,848` UTF-8 bytes; `900,559` UTF-16 code units. The bank is `233,848` bytes over the new-bank 950,000-byte target, while remaining under the app’s 1,000,000-code-unit parser cap.
- Shape: 8 lessons, 50 concepts, 50 study sections; 708 questions (85 L / 493 X / 80 R / 35 T / 15 legacy generated); 708 section references, each exactly once; 85 concept-check links.

## D-a…D-o checks

| ID | Finding | Result |
|---|---|---|
| D-a | یادگیری عمومی/تکراری | 58 پرسش کلی و 15 ارجاع تکراری به مثال ثبت شد. تطبیق موضوع هر پرسش با مثال و پوشش Try It نیازمند استخراج منبع است و فعلاً NOT_TESTED. |
| D-b | مثال‌های فشرده/ناقص | تعداد و گام‌های مثال‌های کتاب با استخراج مستقل مقایسه نشد؛ NOT_TESTED. |
| D-c | بلوک ریاضی بدون مقدمه | 49 مورد. |
| D-d | بلوک تکراری | 86 مورد تکرار محتوایی در کل بانک (مقایسهٔ canonical، بدون درنظرگرفتن page). |
| D-e | ایزولهٔ دوجهتهٔ شکسته | 20 بلوک با lint مشخص‌شده تطبیق یافت. |
| D-f | راهنمای مرور با ارجاع ناموجود | 115 ارجاع به عنوان/بازهٔ بخشی که در همان بانک پیدا نشد. |
| D-g | نگاشت سؤال‌های مرور به بخش کتاب | NOT_TESTED؛ به فهرست گروه‌بندی Review/Test از منبع نیاز دارد. |
| D-h | صفحهٔ واقعی هر بلوک | در 50 مفهوم، همهٔ بلوک‌ها صفحهٔ شروع مفهوم را دارند. مقایسه با PDF-page map مستقل NOT_TESTED. |
| D-i | صورت سؤال طولانی به‌جای برچسب | 39 مورد X/R/T شامل محتوا/نشانه‌های مسئله در prompt بود. |
| D-j | LaTeX خام در حالت text | 5 مورد. |
| D-k | تمرین X داخل درس مرور | 4 مورد. |
| D-l | پوشش پاسخ‌نامه | NOT_TESTED؛ خروجی خصوصی قدیمی متن تخت‌شده بود و جدول Markdown برای خواندن ردیف‌ها نداشت. هیچ مقدار پاسخ در این گزارش ثبت نشده است. |
| D-m | شکل‌ها/alt/caption/src | caption خالی: 7؛ alt عمومی: 11؛ رخداد src تکراری: 3 (۲ منبع تکراری یکتا در آمار قالب). |
| D-n | یکنواختی زیرقسمت‌ها/سرستون‌ها | lint سبک نشانگر زیرقسمت: 1؛ زبان متن داخل \text{}: 1 مورد ناهمگونی در سطح فصل. |
| D-o | answerType غایب | 38 پرسش. |

## Additional lint

- Missing `answerType`: 38 (includes legacy generated questions).
- X-ID width: 397 baseline items use the wrong width under the new rule (the book section has fewer than 100 exercises, so IDs should be two digits).
- Three `sections[].pages` values fail the required numeric page-range pattern.
- App/lesson parser warnings are zero; section references have zero missing, duplicate, or unreferenced IDs.
- Private answer-key row parsing and answer-leak scanning: `NOT_TESTED` because the older export was not Markdown-table formatted. The report contains no answer values.
- Book-source checks (Examples/Try Its, review grouping, per-block PDF pages, figure inventory, and X/R/T number/operator parity): `NOT_TESTED`; no new source extract was created in this checkpoint.
- The validator includes hooks for those checks once a source extract and per-chapter private Markdown key exist. No full app test suite was run.

## Scope stop

- OpenStax’s official Preface has a clause requiring prior written permission before book material is ingested into an LLM or generative-AI offering. This checkpoint did not download/extract new book pages or create any Chapter 2–12 content. The source-extraction/content phases are blocked pending permission review.
- The wording and permission implication need review by the owner; this is not legal advice.

## Files

- Full machine-readable findings: `ch1-validator.json` (IDs/counts only; no question or answer text).
- Validator: `validate-bank.ts`; Vite SSR launcher: `run-validator.mjs`.
