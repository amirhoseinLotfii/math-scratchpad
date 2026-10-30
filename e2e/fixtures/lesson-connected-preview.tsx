import { createRoot } from 'react-dom/client';
import { Provider } from '../../src/app/store-provider';
import { App } from '../../src/App';
import { bankDocument, type DriveBank } from '../../src/features/drive-bank/drive-bank';
import { actions, initialState, makeStore } from '../../src/store';
import sample from '../../examples/MATH_QUESTION_BANK.sample.json';
import '../../src/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/globals.css';
import '../../src/styles.css';

// Test-only clone of the existing safe sample bank. It is never uploaded, persisted, or used by the app runtime.
const bank = structuredClone(sample) as DriveBank;
bank.lessons![0].concepts[0].blocks.push({
  type: 'paragraph',
  lang: 'fa',
  text: 'این متن فارسیِ آزمایشی برای بررسی راست‌چین‌شدن و شکست طبیعی سطرهاست. عبارت‌های ریاضی و نویسه‌های لاتین باید در جای خود چپ‌به‌راست بمانند. '.repeat(3),
});
if (new URLSearchParams(location.search).get('empty') === '1') bank.lessons = [];
if (new URLSearchParams(location.search).get('table') === '1') bank.lessons![0].concepts[0].blocks.unshift({
  type: 'math', latex: String.raw`\begin{array}{|c|c|c|c|c|c|c|c|c|c|c|c|c|} \hline Input & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 & 10 & 11 & 12 \\ \hline Output & 2 & 4 & 6 & 8 & 10 & 12 & 14 & 16 & 18 & 20 & 22 & 24 \\ \hline \end{array}`,
});
if (new URLSearchParams(location.search).get('notation') === '1') bank.lessons![0].concepts[0].blocks.unshift(
  { type: 'math', latex: String.raw`\{(\text{odd},1),\ (\text{even},2)\}` },
  { type: 'math', latex: String.raw`\begin{array}{ll} x & \text{ورودی} \\ y & \text{خروجی} \end{array}` },
  { type: 'math', latex: String.raw`f(x)=x^2;\quad \text{(a) } \sqrt[3]{x}` },
);
if (new URLSearchParams(location.search).has('bidi')) {
  bank.lessons![0].title = 'توابع و تابع‌نما (Functions and Function Notation)';
  bank.lessons![0].concepts[0].title = 'تعریف تابع (Function Definition and Notation)';
  bank.lessons![0].concepts[0].blocks.push({
    type: 'paragraph', lang: 'fa',
    text: 'در این توضیح، عبارت انگلیسی (Functions and Function Notation) و (domain and range) با ترتیب درست نمایش داده می‌شوند.',
  });
}
const version = 'sample-v1-browser-preview';
const store = makeStore(initialState());
store.dispatch(actions.load({ doc: bankDocument(bank, version) }));
// Keep a clean keyboard-entry route for editor browser checks that are not about the scale modal.
if (new URLSearchParams(location.search).has('no-wellbeing')) store.dispatch(actions.setSessionMeta({ anxiety: 3, energy: 3 }));
store.dispatch(actions.keyboard(true));

createRoot(document.getElementById('math-scratchpad-redux')!).render(
  <Provider store={store}><App initialBank={{ bank, version }} /></Provider>,
);
