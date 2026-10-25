/**
 * Thirty fixed, no-hint diagnostic prompts. Only the stem is Persian;
 * all UI controls, math and navigation remain LTR/English.
 * Do not store answer keys in a user session export.
 */
export type DiagnosticQuestion = {
  id: number;
  stem: string;
  source: string;
  expected: string;
  skill: string;
  simplest?: boolean;
};
export const diagnosticQuestions: DiagnosticQuestion[] = [
  { id: 1, stem: 'برای هم‌ارز شدن دو کسر، عدد جای خالی را پیدا کن.', source: '\\frac{3}{5}=\\frac{\\square}{20}', expected: '12', skill: 'Equivalence' },
  { id: 2, stem: 'کسر زیر را تا ساده‌ترین شکل ممکن ساده کن.', source: '\\frac{42}{56}', expected: '3/4', skill: 'Simplification', simplest: true },
  { id: 3, stem: 'عدد اعشاری را به کسر ساده تبدیل کن.', source: '0.375', expected: '3/8', skill: 'Decimals', simplest: true },
  { id: 4, stem: 'کدام کسر بزرگ‌تر است؟ همان کسر را بنویس.', source: '\\frac{5}{8},\\frac{7}{12}', expected: '5/8', skill: 'Comparison' },
  { id: 5, stem: 'حاصل جمع دو عدد علامت‌دار را پیدا کن.', source: '-\\frac{5}{6}+\\frac{1}{4}', expected: '-7/12', skill: 'Signed fractions' },
  { id: 6, stem: 'حاصل تفریق را محاسبه کن.', source: '\\frac{7}{8}-\\frac{1}{3}', expected: '13/24', skill: 'Subtraction' },
  { id: 7, stem: 'حاصل جمع را در قالب یک کسر بنویس.', source: '\\frac{2}{9}+\\frac{5}{6}', expected: '19/18', skill: 'Addition' },
  { id: 8, stem: 'در این تفریق علامت پاسخ را هم بررسی کن.', source: '\\frac{3}{4}-\\frac{7}{8}', expected: '-1/8', skill: 'Signed fractions' },
  { id: 9, stem: 'تفریق کسرها با مخرج متفاوت را انجام بده.', source: '\\frac{5}{12}-\\frac{3}{4}', expected: '-1/3', skill: 'Subtraction' },
  { id: 10, stem: 'هر تبدیل هم‌ارز را با دقت بنویس و تفریق کن.', source: '\\frac{3}{8}-\\frac{5}{6}', expected: '-11/24', skill: 'Equivalence' },
  { id: 11, stem: 'تفریق دو کسر را با توجه به علامت‌ها انجام بده.', source: '-\\frac{7}{12}-\\frac{1}{8}', expected: '-17/24', skill: 'Signed fractions' },
  { id: 12, stem: 'در عبارت زیر به پرانتز و علامت‌های منفی دقت کن.', source: '(-\\frac{3}{5})-(-\\frac{7}{10})', expected: '1/10', skill: 'Signed fractions' },
  { id: 13, stem: 'ضرب را انجام بده و حاصل را ساده کن.', source: '\\frac{2}{3}\\times\\frac{9}{10}', expected: '3/5', skill: 'Multiplication', simplest: true },
  { id: 14, stem: 'حاصل ضرب کسر منفی و مثبت را ساده کن.', source: '(-\\frac{5}{8})\\times\\frac{4}{15}', expected: '-1/6', skill: 'Multiplication', simplest: true },
  { id: 15, stem: 'تقسیم دو کسر را انجام بده.', source: '\\frac{3}{4}\\div\\frac{9}{16}', expected: '4/3', skill: 'Division' },
  { id: 16, stem: 'حاصل تقسیم دو کسر منفی را محاسبه کن.', source: '(-\\frac{7}{9})\\div(-\\frac{14}{27})', expected: '3/2', skill: 'Division' },
  { id: 17, stem: 'دو عدد مخلوط را جمع کن؛ پاسخ را به کسر نامتعارف بنویس.', source: '1\\frac{3}{4}+2\\frac{5}{6}', expected: '55/12', skill: 'Mixed numbers' },
  { id: 18, stem: 'عدد مخلوط و کسر معمولی را از هم کم کن.', source: '1\\frac{2}{3}-\\frac{3}{4}', expected: '11/12', skill: 'Mixed numbers' },
  { id: 19, stem: 'اعشار منفی را به ساده‌ترین کسر تبدیل کن.', source: '-0.125', expected: '-1/8', skill: 'Decimals', simplest: true },
  { id: 20, stem: 'یک عدد اعشاری و یک کسر را جمع کن.', source: '0.2+\\frac{3}{10}', expected: '1/2', skill: 'Decimals' },
  { id: 21, stem: 'از نظر اندازه، کدام کسر بین دو کسر دیگر قرار دارد؟', source: '\\frac{5}{12},\\frac{3}{7},\\frac{4}{9}', expected: '3/7', skill: 'Comparison' },
  { id: 22, stem: 'فاصلهٔ دو عدد زیر روی محور اعداد را حساب کن.', source: '\\abs{-\\frac{3}{4}-\\frac{1}{2}}', expected: '5/4', skill: 'Absolute value' },
  { id: 23, stem: 'مقدار کسر مجهول را به دست بیاور.', source: '\\frac{5}{6}-\\square=\\frac{1}{4}', expected: '7/12', skill: 'Inverse operations' },
  { id: 24, stem: 'دو سوم از این مقدار کسری چقدر می‌شود؟', source: '\\frac{2}{3}\\times\\frac{27}{10}', expected: '9/5', skill: 'Multiplication' },
  { id: 25, stem: 'هر دستور غذا سه‌چهارم پیمانه آرد لازم دارد. برای دو و دو‌سوم برابر دستور، چند پیمانه لازم است؟', source: '\\frac{3}{4}\\times 2\\frac{2}{3}', expected: '2', skill: 'Word problems' },
  { id: 26, stem: 'مخزن ابتدا هفت‌هشتم پر است. یک‌سوم و بعد یک‌چهارم کل ظرفیت مصرف می‌شود. چقدر باقی می‌ماند؟', source: '\\frac{7}{8}-\\frac{1}{3}-\\frac{1}{4}', expected: '7/24', skill: 'Word problems' },
  { id: 27, stem: 'کسر مجهول در ضرب را پیدا کن.', source: '\\square\\times\\frac{4}{5}=\\frac{14}{15}', expected: '7/6', skill: 'Inverse operations' },
  { id: 28, stem: 'مساحت مستطیل با این طول و عرض چند متر مربع است؟', source: '\\frac{5}{6}\\times\\frac{9}{10}', expected: '3/4', skill: 'Word problems' },
  { id: 29, stem: 'عبارت دارای پرانتزهای تودرتو را با ترتیب درست عملیات حل کن.', source: '1-(\\frac{3}{4}-(\\frac{1}{2}-\\frac{1}{3}))', expected: '5/12', skill: 'Order of operations' },
  { id: 30, stem: 'چالش نهایی: عدد مخلوط، تقسیم کسرها، پرانتز و تفریق را ترکیب کن.', source: '2\\frac{1}{4}-(\\frac{5}{6}\\div(\\frac{10}{9}))-\\frac{3}{8}', expected: '9/8', skill: 'Order of operations' }
];
