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
    { id: 'TEXT-1', mode: 'text', source: 'Explain the relation in a short sentence.', answerType: 'text' },
    { id: 'CHOICE-1', mode: 'math', source: '3+4', prompt: 'Choose a comparison symbol.', answerType: 'choice', choices: ['<', '>'] },
    { id: 'MATH-1', mode: 'math', source: '2+3' },
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
