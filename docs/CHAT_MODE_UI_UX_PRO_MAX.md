# UI/UX Pro Max in GitHub-connected Chat Mode

**هدف:** استفاده از دستورالعمل‌های UI/UX Pro Max در چت معمولی ChatGPT، بدون وابستگی به Work یا Codex.

## وضعیت نصب

- مسیر اصلی: `.agents/skills/ui-ux-pro-max/`
- مبدا: `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill`
- کامیت ثابت مبدا: `b7d5353e0130feb8c5574ef1251f8a1db1873ccb`
- تعداد فایل‌های کپی‌شده از مسیر اصلی: 74
- همراه با `SKILL.md`، همهٔ فایل‌های `data/`، `references/`، `scripts/` و تست‌های upstream.
- مجوز استفاده: MIT؛ فایل `LICENSE` در پوشهٔ Skill موجود است.
- این روش **نصب در مخزن GitHub** است، نه نصب سراسری یا ثبت خودکار Skill در تنظیمات حساب ChatGPT.

## استفاده در Chat Mode

ابتدای گفت‌وگو درخواست کن:

> به GitHub مخزن `amirhoseinLotfii/math-scratchpad` متصل شو. ابتدا `AGENTS.md`، `docs/design-system.md`، `.agents/skills/ui-ux-pro-max/SKILL.md` و فایل‌های مرجع مرتبط را بخوان. برای هر تغییر UI/UX از قواعد UI/UX Pro Max و راهنمای React استفاده کن، ولی طرح مصوب و رفتار کیبورد ریاضی، RTL/LTR، دسترس‌پذیری و تست‌های موجود را حفظ کن. روی یک Branch جدا تغییر بده، تست‌های اجراشده/اجرانشده را صادقانه گزارش کن و Pull Request بساز. Work و Codex لازم نیست.

### مهم

Chat Mode با اتصال GitHub می‌تواند فایل‌های Skill را بخواند، بررسی کند و با ابزارهای GitHub فایل/PR بسازد. اما نصب فایل‌های Skill در مخزن به‌تنهایی آن‌ها را به Skill داخلی/خودکار ChatGPT تبدیل نمی‌کند. در هر چت جدید باید مسیرها را اعلام کنی یا از دستیار بخواهی بخواند. اگر اجرای ترمینال در دسترس نیست، دستیار می‌تواند فقط قواعد Markdown/CSV را بخواند و نباید ادعای اجرای Python، build یا تست محلی بکند.

## جست‌وجوی کامل با Python (اختیاری، در محیط دارای شل)

در ریشهٔ پروژه و با Python 3:

```bash
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "focus dialog keyboard" --domain ux
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "responsive layout component" --stack react
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "math learning application mobile accessible" --design-system -p "Math Scratchpad"
```

دستور آخر فقط خروجی پیشنهادی تولید می‌کند؛ تغییر Design System پروژه نیازمند تأیید است. از `--persist` یا `--force` بدون مجوز استفاده نکن.

## هنگام رفع باگ‌های UI

1. ابتدا کد همان کامپوننت و CSS را بخوان، سپس فقط قانون مرتبط از `references/quick-reference.md` و `data/ux-guidelines.csv` را انتخاب کن.
2. راهکار را با `docs/design-system.md` و قرارداد `docs/MOBILE_TEST_PLAN.md` تطبیق بده.
3. پوشش responsive، keyboard/focus، hover/touch، contrast، scrolling و وضعیت loading/error را بررسی کن.
4. فقط تست‌های واقعاً اجراشده را PASS اعلام کن. تأیید دستی Android/TalkBack را تا زمان آزمون واقعی «نیازمند تست» ثبت کن.

## کنترل یکپارچگی کپی upstream

```bash
node scripts/verify-vendored-ui-skill.mjs
```

این اسکریپت SHA-1 مطابق ساختار Git blob را برای هر فایل اصلی بررسی می‌کند؛ فایل‌های سفارشی پروژه مثل `LICENSE` و `UPSTREAM.md` را جزو تطبیق ۷۴ فایل حساب نمی‌کند. فایل manifest در `docs/ui-ux-pro-max-source-manifest.json` ثبت شده است.

## به‌روزرسانی در آینده

نسخهٔ جدید upstream را بازبینی کن؛ commit مبدا و همهٔ hashهای manifest را همراه ۷۴ فایل به‌روز کن و تغییرات را جداگانه تست کن. به‌روزرسانی خودکار و بدون بازبینی انجام نده.
