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
const version = 'sample-v1-browser-preview';
const store = makeStore(initialState());
store.dispatch(actions.load({ doc: bankDocument(bank, version) }));
store.dispatch(actions.keyboard(true));

createRoot(document.getElementById('math-scratchpad-redux')!).render(
  <Provider store={store}><App initialBank={{ bank, version }} /></Provider>,
);
