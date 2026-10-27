# بانک سؤال خصوصی در Google Drive

برنامه با مجوز محدود `drive.file` فقط به فایلی دسترسی دارد که خودت یک بار در پنجرهٔ انتخاب فایل Google (Picker) انتخاب کنی؛ بقیهٔ Drive دیده نمی‌شود و فایل عمومی نمی‌شود. وقتی صفحه باز است، هر ۳۰ ثانیه فقط مشخصات فایل (md5Checksum، headRevisionId، version) خوانده می‌شود و محتوا فقط وقتی تغییر کرده دانلود می‌شود. جلسهٔ باز هرگز خودکار عوض نمی‌شود؛ قبل از بازکردن دستهٔ تازه جلسهٔ فعلی در مرورگر ذخیره می‌شود. شناسهٔ بانک، نسخه و شناسهٔ سؤال در خروجی مربی ثبت می‌شوند.

## راه‌اندازی اولیه (یک بار)
1. Google Cloud Console: پروژه بساز، Google Drive API و Google Picker API را فعال کن.
2. OAuth consent screen: External، حالت Testing، حساب شخصی پروژه را در Test users اضافه کن؛ scope: `drive.file`.
3. Credentials: OAuth client از نوع Web application با Authorized JavaScript origin `https://amirhoseinlotfii.github.io`؛ و یک API key محدود به HTTP referrer `https://amirhoseinlotfii.github.io/*` و فقط Google Picker API.
4. در برنامه: منو ← `Google Drive · بانک سؤال` ← Client ID، API key و Project number را وارد کن، «اتصال Google Drive» را بزن و فایل `MATH_QUESTION_BANK.json` را انتخاب کن. هیچ client secret یا توکنی لازم نیست و ذخیره نمی‌شود.

مجوز Google حدود یک ساعت معتبر است و فقط در حافظهٔ صفحه نگه داشته می‌شود؛ پس از آن یا پس از بستن صفحه یک لمس روی «اتصال دوباره» لازم است (انتخاب فایل تکرار نمی‌شود). کلید پاسخ در فایل جدا (مثلاً `MATH_ANSWER_KEY.json`) بماند و هرگز در برنامه انتخاب نشود. فایل خالی خطا نیست و «هنوز خالی» نمایش داده می‌شود.

## قالب فایل

```json
{
  "schema_version": "math-scratchpad.bank/1.0",
  "bank_id": "MATH-DRIVE-QUESTIONS",
  "version": "v1",
  "questions": []
}
```

هر سؤال با `id` یکتا، `mode` برابر `math` یا `text`، فیلد `source` و فیلد اختیاری `prompt` تعریف می‌شود. حداکثر ۴۰ سؤال در هر نسخه مجاز است. متن سؤال و کلید پاسخ جدا هستند؛ فیلدهای پاسخ در بانک پذیرفته نمی‌شوند. نسخهٔ نهایی شامل اثرانگشت محتواست تا حتی اگر شمارهٔ نسخه فراموش شود، دو محتوای متفاوت یک نسخه تلقی نشوند.

در خروجی، زمان و استقلال همان داده‌هایی هستند که برنامه واقعاً ثبت کرده است. دریافت بانک جدید پاسخ قبلی را به چت یا Notion ارسال نمی‌کند؛ خروجی مربی همچنان باید توسط کاربر به گفتگو فرستاده شود.
