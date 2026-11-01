import { createRoot } from 'react-dom/client';
import { Provider } from '../../src/app/store-provider';
import { App } from '../../src/App';
import { bankDocument, validateBank } from '../../src/features/drive-bank/drive-bank';
import { actions, initialState, makeStore } from '../../src/store';
import '../../src/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/globals.css';
import '../../src/styles.css';

const lessonId = 'ACTIVE-1.1';
const conceptId = 'ACTIVE-1.1-C1';
const firstCheckId = 'ACTIVE-1.1-C1-K01-Q01';
const secondCheckId = 'ACTIVE-1.1-C1-K02-Q01';
const sectionId = 'ACTIVE-1.1-P17-20';
const rawBank = {
  schema_version: 'math-scratchpad.bank/1.0', bank_id: 'active-flow-e2e', version: 'v22',
  chapter: { id: 'PC-1', number: 1, title: 'توابع', source: 'OpenStax Precalculus 2e', pdfPages: '17–20', lessonIds: [lessonId] },
  lessons: [{
    id: lessonId, book: 'OpenStax Precalculus 2e', section: '1.1', title: 'توابع', pages: '17–20',
    concepts: [{
      id: conceptId, title: 'رابطه و تابع', pages: '17–20', checkQuestionIds: [firstCheckId, secondCheckId],
      blocks: [
        { type: 'heading', lang: 'fa', page: 17, text: 'رابطه و تابع' },
        { type: 'paragraph', lang: 'fa', page: 17, text: 'رابطه مجموعه‌ای از زوج‌های مرتب است. هر ورودی را با خروجیِ متناظر آن بررسی کن.' },
        { type: 'math', page: 18, latex: String.raw`\{(1,2),\ (2,4)\}` },
        { type: 'example', lang: 'fa', page: 18, title: 'مثال ۱ — تشخیص رابطه', text: 'دامنه و برد این رابطه را پیدا کن.', latex: String.raw`\{(1,2),\ (2,4)\}`, steps: ['دامنه از مؤلفهٔ اول هر زوج ساخته می‌شود.', 'برد: \(\{2,4\}\).'] },
        { type: 'paragraph', lang: 'fa', page: 19, text: 'برای تشخیص تابع، بررسی کن هر ورودی بیش از یک خروجی نداشته باشد.' },
      ],
      learningChunks: [
        { id: 'ACTIVE-1.1-C1-K01', title: 'رابطه و زوج‌های مرتب', pages: '17', blockIndexes: [0, 1], questionIds: [firstCheckId] },
        { id: 'ACTIVE-1.1-C1-K02', title: 'تشخیص تابع', pages: '18–19', blockIndexes: [2, 3, 4], questionIds: [secondCheckId] },
      ],
    }],
    sections: [{ id: sectionId, title: 'رابطه و تابع', pages: '17–20', conceptIds: [conceptId], learnQuestionIds: [firstCheckId, secondCheckId], practiceQuestionIds: ['ACTIVE-1.1-X01'] }],
  }],
  questions: [
    { id: firstCheckId, mode: 'text', answerType: 'text', source: 'دامنهٔ {(1,2),(2,4)} را بنویس.', lessonId, conceptId, stage: 'learn', origin: 'generated', sectionId },
    { id: secondCheckId, mode: 'text', answerType: 'text', source: 'آیا این رابطه تابع است؟ دلیل کوتاهت را بنویس.', lessonId, conceptId, stage: 'learn', origin: 'generated', sectionId },
    { id: 'ACTIVE-1.1-X01', mode: 'math', source: '4+5', prompt: 'تمرین کتاب ۱: حاصل را پیدا کن.', lessonId, conceptId, stage: 'practice', origin: 'textbook', sectionId },
  ],
};
const bank = validateBank(rawBank);
const version = 'v22-active-flow-e2e';
const store = makeStore(initialState());
store.dispatch(actions.load({ doc: bankDocument(bank, version) }));
store.dispatch(actions.setSessionMeta({ anxiety: 3, energy: 3 }));
store.dispatch(actions.keyboard(true));

createRoot(document.getElementById('math-scratchpad-redux')!).render(
  <Provider store={store}><App initialBank={{ bank, version }} /></Provider>,
);
