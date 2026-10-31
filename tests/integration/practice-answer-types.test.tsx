import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { App } from '../../src/App';
import { Provider } from '../../src/app/store-provider';
import { bankDocument, validateBank } from '../../src/features/drive-bank/drive-bank';
import { buildTutorExport, missingFinalAnswers } from '../../src/features/session/export/tutor-export';
import { initialState, makeStore, actions } from '../../src/store';
import { serialize, validateSession } from '../../src/persistence';

afterEach(() => { cleanup(); localStorage.clear(); });

const bank = validateBank({
  schema_version: 'math-scratchpad.bank/1.0', bank_id: 'answer-types', version: 'v1',
  questions: [
    { id: 'TEXT-1', mode: 'text', source: '{(1,4), (2,4), (3,5)}', prompt: 'آیا این رابطه تابع است؟ اگر نه، کدام ورودی مشکل دارد؟', answerType: 'text' },
    { id: 'CHOICE-1', mode: 'math', source: 'x+1', prompt: 'Choose one.', answerType: 'choice', choices: ['<', '>'] },
    { id: 'MATH-1', mode: 'math', source: '2+3' },
  ],
});
const VERSION = 'answer-types-v1';

function mount() {
  const state = initialState();
  const doc = bankDocument(bank, VERSION);
  doc.session!.anxiety = 2;
  doc.session!.energy = 3;
  state.doc = doc;
  const store = makeStore(state);
  render(<div id="math-scratchpad-redux"><Provider store={store}><App initialBank={{ bank, version: VERSION }} /></Provider></div>);
  return store;
}

describe('Practice question answer types', () => {
  it('maps answer types and options into a backward-compatible session document', () => {
    const doc = bankDocument(bank, VERSION);
    expect(doc.exercises.map(exercise => exercise.answerType)).toEqual(['text', 'choice', 'math']);
    expect(doc.exercises[1].choices).toEqual(['<', '>']);

    const legacy = validateBank({ schema_version: 'math-scratchpad.bank/1.0', bank_id: 'legacy-text', version: 'v1', questions: [{ id: 'OLD-1', mode: 'math', source: '1+2' }, { id: 'OLD-2', mode: 'text', source: 'Describe the pattern.' }] });
    expect(bankDocument(legacy, 'legacy-v1').exercises.map(exercise => exercise.answerType)).toEqual(['math', 'text']);
  });

  it('shows both the prompt and the given relation for a text-answer question', () => {
    mount();
    const problem = screen.getByRole('region', { name: 'Current problem' });
    expect(within(problem).getByText('آیا این رابطه تابع است؟ اگر نه، کدام ورودی مشکل دارد؟')).toBeVisible();
    expect(within(problem).getByText('{(1,4), (2,4), (3,5)}')).toBeVisible();
  });

  it('renders text and choice controls, keeps answers on question switches, and leaves math steps intact', async () => {
    const user = userEvent.setup();
    const store = mount();

    const answer = screen.getByRole('textbox', { name: 'Answer' });
    await user.type(answer, 'A short explanation');
    expect(screen.queryByRole('button', { name: 'Add step' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark Step 1 as final' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show Keyboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Insert fraction/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Write each step. Review when you're ready.")).not.toBeInTheDocument();
    expect(store.getState().doc.exercises[0].answerText).toBe('A short explanation');

    act(() => store.dispatch(actions.adjacentExercise(1)));
    const less = screen.getByRole('radio', { name: '<' });
    const greater = screen.getByRole('radio', { name: '>' });
    await user.click(greater);
    expect(greater).toBeChecked();
    expect(store.getState().doc.exercises[1]).toMatchObject({ answerType: 'choice', choices: ['<', '>'], answerText: '>' });
    expect(screen.queryByRole('button', { name: 'Add step' })).not.toBeInTheDocument();
    expect(less).not.toBeChecked();

    act(() => store.dispatch(actions.adjacentExercise(-1)));
    expect(screen.getByRole('textbox', { name: 'Answer' })).toHaveValue('A short explanation');
    act(() => store.dispatch(actions.adjacentExercise(1)));
    expect(screen.getByRole('radio', { name: '>' })).toBeChecked();
    act(() => { store.dispatch(actions.adjacentExercise(1)); store.dispatch(actions.adjacentExercise(1)); });
    expect(screen.getByRole('button', { name: 'Add step' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Mark Step 1 as final' })).toBeVisible();
  });

  it('round-trips typed responses through session storage and tutor export without changing its schema', async () => {
    const user = userEvent.setup();
    const store = mount();
    await user.type(screen.getByRole('textbox', { name: 'Answer' }), 'تابع از روی تعریف');
    act(() => store.dispatch(actions.adjacentExercise(1)));
    await user.click(screen.getByRole('radio', { name: '>' }));

    const restored = validateSession(JSON.parse(serialize(store.getState())));
    expect(restored.doc.exercises[0]).toMatchObject({ answerType: 'text', answerText: 'تابع از روی تعریف' });
    expect(restored.doc.exercises[1]).toMatchObject({ answerType: 'choice', choices: ['<', '>'], answerText: '>' });

    const exported = buildTutorExport(restored.doc);
    expect(exported.items[0]).toMatchObject({ student_answer: 'تابع از روی تعریف', final_answer: 'تابع از روی تعریف', steps: [] });
    expect(exported.items[1]).toMatchObject({ student_answer: '>', final_answer: '>', steps: [] });
    expect(missingFinalAnswers(restored.doc)).toEqual([]);
    expect(Object.keys(exported.items[0])).not.toContain('answerText');
    expect(Object.keys(exported.items[0])).toContain('student_answer');
  });
});
