import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { App } from '../../src/App';
import { Provider } from '../../src/app/store-provider';
import { bankDocument, readArchive, validateBank } from '../../src/features/drive-bank/drive-bank';
import { actions, initialState, makeStore } from '../../src/store';
import { parse } from '../../src/parser';
import { serialize } from '../../src/persistence';
import type { DriveBank } from '../../src/features/drive-bank/drive-bank';

const fixture = (): DriveBank => validateBank(JSON.parse(readFileSync('examples/MATH_QUESTION_BANK.sample.json', 'utf8')) as unknown);
const VERSION = 'sample-v1-phase3';
afterEach(() => { cleanup(); localStorage.clear(); });

function mountWithBank() {
  const bank = fixture();
  const state = initialState();
  const doc = bankDocument(bank, VERSION);
  doc.exercises[0].steps[0].expression = parse('8+9');
  state.doc = doc;
  const store = makeStore(state);
  const now = Date.now();
  store.dispatch(actions.timerStart({ exerciseId: doc.exerciseId, now }));
  render(<Provider store={store}><App initialBank={{ bank, version: VERSION }} /></Provider>);
  return { bank, doc, store };
}

describe('Phase 3 Learn integration', () => {
  it('offers a clear Learn empty state and opens the existing Drive bank flow when no bank is loaded', async () => {
    render(<Provider store={makeStore(initialState())}><App /></Provider>);
    expect(screen.queryByRole('button', { name: 'Lesson' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Exercise menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Lessons' }));
    const picker = screen.getByRole('dialog', { name: 'Lessons' });
    expect(within(picker).getByRole('status')).toHaveTextContent('No question bank is loaded');
    await userEvent.click(within(picker).getByRole('button', { name: 'Load bank' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Lessons' })).not.toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'Google Drive question bank' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Google Drive question bank' })).toBeVisible();
  });

  it('opens a read-only reference without changing work, pauses the timer, and returns focus', async () => {
    const user = userEvent.setup();
    const { store } = mountWithBank();
    const trigger = screen.getByRole('button', { name: 'Lesson' });
    const questionBefore = structuredClone(store.getState().doc.exercises[0]);
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Sample lesson' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.getAttribute('aria-labelledby')).toBe(within(dialog).getByRole('heading', { name: 'Sample lesson' }).id);
    expect(within(dialog).getByText('Sample concept heading')).toBeVisible();
    expect(within(dialog).getByText('Another sample concept')).toBeVisible();
    expect(within(dialog).getByText('Sample choice check.')).toBeVisible();
    expect(within(dialog).queryAllByRole('radio')).toHaveLength(0);
    expect(store.getState().doc.exercises[0].timerPaused).toBe(true);
    expect(store.getState().doc.exercises[0].steps).toEqual(questionBefore.steps);
    expect(store.getState().doc.exercises[0].source).toBe(questionBefore.source);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sample lesson' })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(store.getState().doc.exercises[0].timerPaused).not.toBe(true);
    expect(store.getState().doc.exercises[0].steps).toEqual(questionBefore.steps);
  });

  it('routes Learn through the menu, isolates checks, confirms skip-to-practice, and loads only sorted practice questions', async () => {
    const user = userEvent.setup();
    const { store } = mountWithBank();
    vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    const before = structuredClone(store.getState().doc);
    await user.click(screen.getByRole('button', { name: 'Exercise menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Lessons' }));
    const picker = screen.getByRole('dialog', { name: 'Lessons' });
    expect(within(picker).getByText('Sample book · 1.1')).toBeVisible();
    await user.click(within(picker).getByRole('button', { name: /Sample lesson.*Not started/ }));
    expect(await screen.findByRole('heading', { name: 'First sample concept' })).toBeVisible();
    expect(store.getState().doc).toEqual(before);

    await user.click(screen.getByRole('radio', { name: 'Option B' }));
    expect(store.getState().doc).toEqual(before);
    expect(serialize(store.getState())).not.toContain('Option B');
    await user.click(screen.getByRole('button', { name: 'Next concept →' }));
    const answerEditor = screen.getByRole('region', { name: 'Math answer for SAMPLE-1.1-L02' });
    await user.click(within(answerEditor).getByRole('button', { name: /^8$/ }));
    await user.click(within(answerEditor).getByRole('button', { name: /^Fraction$/ }));
    await user.click(within(answerEditor).getByRole('button', { name: /^3$/ }));
    expect(store.getState().doc).toEqual(before);
    expect(serialize(store.getState())).not.toContain('SAMPLE-1.1-L02');
    await user.click(screen.getByRole('button', { name: 'Skip to practice' }));
    const confirm = screen.getByRole('dialog', { name: 'Skip to practice?' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(store.getState().doc).toEqual(before);

    await user.click(screen.getByRole('button', { name: 'Skip to practice' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Skip to practice?' })).getByRole('button', { name: 'Skip to practice' }));
    await waitFor(() => expect(screen.getByText('Sample practice 1.')).toBeVisible());
    expect(store.getState().doc.exercises.map(question => question.bankQuestionId)).toEqual([
      'SAMPLE-1.1-P01', 'SAMPLE-1.1-P02', 'SAMPLE-1.1-P03',
    ]);
    expect(serialize(store.getState())).not.toContain('Option B');
    const archive = readArchive();
    expect(archive).toHaveLength(1);
    expect(archive[0].data).not.toContain('Option B');
    expect(JSON.parse(archive[0].data).doc.exercises.map((question: { bankQuestionId: string }) => question.bankQuestionId)).toEqual([
      'SAMPLE-1.1-P01', 'SAMPLE-1.1-P02', 'SAMPLE-1.1-P03',
    ]);
    expect(store.getState().doc.session?.bankId).toBe('sample-lessons');
  });

  it('preserves normal imported sessions and only shows a Lesson button for a valid bank link', () => {
    const bank = fixture();
    const state = initialState();
    const doc = bankDocument(bank, VERSION);
    doc.exercises[0].bankQuestionId = 'unknown-question';
    state.doc = doc;
    const store = makeStore(state);
    render(<Provider store={store}><App initialBank={{ bank, version: VERSION }} /></Provider>);
    expect(screen.queryByRole('button', { name: 'Lesson' })).not.toBeInTheDocument();
  });

  it('shows grouped lesson status after practice starts and marks an explicitly finished batch done', async () => {
    const user = userEvent.setup();
    const { store } = mountWithBank();
    await user.click(screen.getByRole('button', { name: 'Exercise menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Lessons' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Lessons' })).getByRole('button', { name: /Sample lesson.*Not started/ }));
    await user.click(screen.getByRole('button', { name: 'Skip to practice' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Skip to practice?' })).getByRole('button', { name: 'Skip to practice' }));
    await waitFor(() => expect(screen.getByText('Sample practice 1.')).toBeVisible());
    fireEvent.change(screen.getByRole('combobox', { name: 'Select question' }), { target: { value: store.getState().doc.exercises.at(-1)!.id } });
    await user.click(screen.getByRole('button', { name: 'Finish session' }));
    const confidence = screen.getByRole('dialog', { name: /confidence/i });
    await user.click(within(confidence).getByRole('radio', { name: 'Medium' }));
    await user.click(within(confidence).getByRole('button', { name: /continue/i }));
    expect(screen.getByRole('dialog', { name: 'Session complete' })).toBeVisible();
    await user.click(within(screen.getByRole('dialog', { name: 'Session complete' })).getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Exercise menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Lessons' }));
    expect(within(screen.getByRole('dialog', { name: 'Lessons' })).getByText('Done')).toBeVisible();
  });
});
