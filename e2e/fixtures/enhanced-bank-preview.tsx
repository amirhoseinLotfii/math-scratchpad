import { createRoot } from 'react-dom/client';
import { Provider } from '../../src/app/store-provider';
import { App } from '../../src/App';
import { bankCacheStorageKey, bankDocument, saveBankCache, snapshotVersion, validateBank, type DriveBank } from '../../src/features/drive-bank/drive-bank';
import { emptyLessonProgressState, saveLessonProgress } from '../../src/features/lessons/lesson-progress-store';
import type { LessonProgress } from '../../src/features/lessons/types';
import { actions, initialState, makeStore } from '../../src/store';
import bankData from '../../data/MATH_QUESTION_BANK_v23.json';
import '../../src/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/globals.css';
import '../../src/styles.css';

const bank = validateBank(structuredClone(bankData) as DriveBank);
const lesson = bank.lessons!.find(entry => entry.id === 'PC-1.4')!;
const version = await snapshotVersion(bank);
const cached = await saveBankCache('e2e-chapter-one-v23', bank, version, 'e2e-fingerprint-v23', localStorage);
if (!cached.saved) throw Error(`The full v23 bank did not fit in browser local storage: ${cached.message}`);
if (!localStorage.getItem(bankCacheStorageKey('e2e-chapter-one-v23'))) throw Error('The v23 offline bank cache could not be read back.');
const now = new Date().toISOString();
const progress: LessonProgress = {
  lessonId: lesson.id, status: 'learning', currentConceptIndex: 0, currentSectionIndex: 0,
  completedSectionIds: [], completedConceptIds: [], answeredCheckIds: [], skippedChecks: [],
  summaryOpen: true, activeConceptPhase: 'summary', learnStartedAt: now, learnDoneAt: now, revealedSteps: {},
};
const progressState = emptyLessonProgressState(bank.bank_id, version);
progressState.progressById[lesson.id] = progress;
const saved = saveLessonProgress(bank, version, progressState, localStorage);
if (!saved.saved) throw Error(saved.message);

const firstPractice = bank.questions.find(question => question.stage === 'practice' && question.tags?.source === 'extra')!;
const store = makeStore(initialState());
store.dispatch(actions.load({ doc: bankDocument(bank, version, [firstPractice]) }));
store.dispatch(actions.setSessionMeta({ anxiety: 3, energy: 3 }));
store.dispatch(actions.keyboard(true));

createRoot(document.getElementById('math-scratchpad-redux')!).render(
  <Provider store={store}><App initialBank={{ bank, version }} /></Provider>,
);
