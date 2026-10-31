import { createRoot } from 'react-dom/client';
import { Provider } from '../../src/app/store-provider';
import { App } from '../../src/App';
import { bankDocument } from '../../src/features/drive-bank/drive-bank';
import { actions, initialState, makeStore } from '../../src/store';
import { validateBank } from '../../src/features/drive-bank/drive-bank';
import '../../src/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/globals.css';
import '../../src/styles.css';

// Isolated browser fixture. It is never uploaded or used by normal app startup.
const bank = validateBank({
  schema_version: 'math-scratchpad.bank/1.0', bank_id: 'qa-answer-types', version: 'v1',
  questions: [
    { id: 'TEXT-1', mode: 'text', source: String.raw`\{(1,4),\ (2,4),\ (3,5)\}`, prompt: 'آیا این رابطه تابع است؟ اگر نه، کدام ورودی مشکل دارد؟', answerType: 'text' },
    { id: 'CHOICE-1', mode: 'math', source: '3+4', prompt: 'Choose a comparison symbol.', answerType: 'choice', choices: ['<', '>'] },
    { id: 'MATH-1', mode: 'math', source: '2+3' },
    { id: 'TABLE-1', mode: 'text', source: String.raw`\begin{array}{c|ccc}\text{Input}&1&2&2\\\hline\text{Output}&3&5&7\end{array}`, prompt: 'از جدول، مقدار خروجی را پیدا کنید.', answerType: 'text' },
    { id: 'MULTIPLE-1', mode: 'text', source: String.raw`f(x)=x^2,\quad (A)\ x^2\quad (B)\ |x|`, prompt: 'کدام نمایش با تابع داده‌شده سازگار است؟', answerType: 'text' },
    { id: 'COMPLEX-MATH-1', mode: 'math', source: String.raw`f(x)=\frac{x^2-1}{\sqrt{x+2}}`, prompt: 'کسر و رادیکال را در یک عبارت بخوانید.', answerType: 'math' },
    { id: 'PERSIAN-WORD-1', mode: 'text', source: 'فرض کنید f(p) مقدار خروجی برای ورودی p باشد. معنی f(5)=2 را توضیح دهید.', prompt: 'یک سؤال متنی فارسی با نمادگذاری تابع.', answerType: 'text' },
    { id: 'MATH-CHOICE-1', mode: 'math', source: 'x+1', prompt: 'یک گزینهٔ ریاضی انتخاب کنید.', answerType: 'choice', choices: [String.raw`x^2`, String.raw`\frac{1}{2}`] },
    { id: 'PIECEWISE-1', mode: 'text', source: String.raw`f(x)=\begin{cases}x^2 & x\le 1\\3 & x>1\end{cases}`, prompt: 'یک تابع چندضابطه‌ای را بخوانید.', answerType: 'text' },
    { id: 'MATRIX-1', mode: 'text', source: String.raw`\begin{bmatrix}1&2\\3&4\end{bmatrix}`, prompt: 'یک ماتریس را در صورت سؤال بخوانید.', answerType: 'text' },
    { id: 'INTERVAL-1', mode: 'text', source: String.raw`x\in(-\infty,2]\cup(2,\infty)`, prompt: 'یک بازه و اجتماع مجموعه‌ها را بخوانید.', answerType: 'text' },
    { id: 'DERIVATIVE-1', mode: 'text', source: String.raw`\frac{\mathrm{d}}{\mathrm{d}x}x^2`, prompt: 'نماد مشتق را در صورت سؤال بخوانید.', answerType: 'text' },
    { id: 'INTEGRAL-1', mode: 'text', source: String.raw`\int_0^1 x^2\,\mathrm{d}x`, prompt: 'نماد انتگرال را در صورت سؤال بخوانید.', answerType: 'text' },
    { id: 'LIMIT-1', mode: 'text', source: String.raw`\lim_{x\to0}\frac{\sin x}{x}`, prompt: 'نماد حد را در صورت سؤال بخوانید.', answerType: 'text' },
    { id: 'INLINE-PERSIAN-MATH-1', mode: 'text', source: 'دامنهٔ \\(f(x)=\\sqrt{x+1}\\) را تعیین کن.', prompt: 'متن فارسی همراه فرمول درون‌خطی.', answerType: 'text' },
  ],
});
const version = 'qa-answer-types-v1';
const state = initialState();
state.doc = bankDocument(bank, version);
state.doc.session!.anxiety = 3;
state.doc.session!.energy = 3;
const store = makeStore(state);
store.dispatch(actions.keyboard(false));

createRoot(document.getElementById('math-scratchpad-redux')!).render(
  <Provider store={store}><App initialBank={{ bank, version }} /></Provider>,
);
