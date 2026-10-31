import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { App } from '../../src/App';
import { Provider } from '../../src/app/store-provider';
import { bankDocument, readArchive, validateBank } from '../../src/features/drive-bank/drive-bank';
import { lessonProgressStorageKey, readLessonProgress } from '../../src/features/lessons/lesson-progress-store';
import { actions, initialState, makeStore } from '../../src/store';
import { parse } from '../../src/parser';
import { serialize } from '../../src/persistence';
import type { DriveBank } from '../../src/features/drive-bank/drive-bank';

const VERSION = 'sample-v1-phase4';
function fixture(): DriveBank {
  const raw = JSON.parse(readFileSync('examples/MATH_QUESTION_BANK.sample.json', 'utf8')) as Record<string, unknown>;
  const lessons = raw.lessons as Array<{ concepts: Array<{ blocks: unknown[] }> }>;
  lessons[0].concepts[0].blocks.push({ type: 'example', title: 'Temporary persistence test example', steps: ['Temporary test step 1', 'Temporary test step 2'] });
  return validateBank(raw);
}
function practiceStore(bank: DriveBank) {
  const state = initialState(), doc = bankDocument(bank, VERSION);
  doc.exercises[0].steps[0].expression = parse('7');
  state.doc = doc;
  return makeStore(state);
}
function withoutTimer(doc: ReturnType<typeof bankDocument>) {
  return { ...doc, exercises: doc.exercises.map(({ timerRunningSince: _running, elapsedMs: _elapsed, ...exercise }) => exercise) };
}
function openLessonPicker(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: 'Exercise menu' }))
    .then(() => user.click(screen.getByRole('menuitem', { name: 'Lessons' })));
}

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe('Phase 4 Learn progress restoration', () => {
  it('routes a section practice set into the regular work area and resumes that section when it is finished', async () => {
    const user = userEvent.setup();
    const bank = fixture();
    bank.questions.find(question => question.id === 'SAMPLE-1.1-P01')!.conceptId = 'SAMPLE-1.1-C1';
    bank.questions.find(question => question.id === 'SAMPLE-1.1-P02')!.conceptId = 'SAMPLE-1.1-C2';
    const store = practiceStore(bank);
    render(<Provider store={store}><App initialBank={{ bank, version: VERSION }} /></Provider>);

    await openLessonPicker(user);
    await user.click(within(screen.getByRole('dialog', { name: 'Lessons' })).getByRole('button', { name: /Sample lesson.*Not started/ }));
    await user.click(screen.getByRole('button', { name: 'Practice this section · 1 question' }));
    await waitFor(() => expect(screen.getByText('Sample practice 1.')).toBeVisible());
    expect(screen.queryByText('Sample practice 2.')).not.toBeInTheDocument();
    expect(screen.queryByText('Sample practice 3.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Finish session' }));
    const confidence = await screen.findByRole('dialog', { name: /confidence/i });
    await user.click(within(confidence).getByRole('radio', { name: 'Medium' }));
    await user.click(within(confidence).getByRole('button', { name: /continue/i }));
    expect(await screen.findByRole('heading', { name: 'First sample concept' })).toBeVisible();
    expect(screen.getByText('This section’s practice is complete.')).toBeVisible();
    const resumed = readLessonProgress(bank, VERSION).progressById['SAMPLE-1.1'];
    expect(resumed).toMatchObject({ status: 'learning', currentSectionIndex: 0, completedSectionIds: ['SAMPLE-1.1-SAMPLE-1.1-C1'] });
    expect(resumed.activePracticeSectionId).toBeUndefined();
  });

  it('resumes a lesson in place, keeps check answers separate, and completes the same practice session after reload', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    const bank = fixture(), store = practiceStore(bank), originalSession = structuredClone(store.getState().doc);
    render(<Provider store={store}><App initialBank={{ bank, version: VERSION }} /></Provider>);

    await openLessonPicker(user);
    const picker = screen.getByRole('dialog', { name: 'Lessons' });
    await user.click(within(picker).getByRole('button', { name: /Sample lesson.*Not started/ }));
    await user.click(screen.getByRole('button', { name: 'Show next step' }));
    expect(screen.getByText('Temporary test step 1')).toBeVisible();
    await user.click(screen.getByRole('radio', { name: 'Option B' }));
    await user.click(screen.getByRole('radio', { name: 'Confidence 4' }));
    await user.click(screen.getByRole('button', { name: 'Next section →' }));
    const mathAnswer = screen.getByRole('region', { name: 'Math answer for SAMPLE-1.1-L02' });
    await user.click(within(mathAnswer).getByRole('button', { name: 'Show Keyboard' }));
    await user.click(within(mathAnswer).getByRole('button', { name: /^8$/ }));

    const progressKey = lessonProgressStorageKey(bank.bank_id, VERSION);
    const saved = JSON.parse(localStorage.getItem(progressKey)!);
    expect(saved.lessons['SAMPLE-1.1']).toMatchObject({
      status: 'learning', currentConceptIndex: 1,
      answeredCheckIds: ['SAMPLE-1.1-L01', 'SAMPLE-1.1-L02'],
      confidenceByCheckId: { 'SAMPLE-1.1-L01': 4 },
      revealedSteps: { 'SAMPLE-1.1-C1:3': 1 },
    });
    expect(saved.lessons['SAMPLE-1.1'].checkAnswers['SAMPLE-1.1-L01']).toEqual({ type: 'choice', value: 'Option B' });
    expect(serialize(store.getState())).not.toContain('Option B');
    expect(serialize(store.getState())).not.toContain('SAMPLE-1.1-L02');
    expect(JSON.stringify(store.getState().doc)).not.toContain('"value":"8"');
    expect(withoutTimer(store.getState().doc)).toEqual(withoutTimer(originalSession));

    cleanup();
    const reloadedStore = makeStore(Object.assign(initialState(), { doc: structuredClone(originalSession) }));
    render(<Provider store={reloadedStore}><App initialBank={{ bank, version: VERSION }} /></Provider>);
    await openLessonPicker(user);
    await user.click(within(screen.getByRole('dialog', { name: 'Lessons' })).getByRole('button', { name: /Sample lesson.*Learning/ }));
    expect(await screen.findByRole('heading', { name: 'Second sample concept' })).toBeVisible();
    const restoredEditor = screen.getByRole('region', { name: 'Math answer for SAMPLE-1.1-L02' });
    expect((restoredEditor.querySelector('math-field[aria-label="Step 1 expression"]') as HTMLElement & { value: string }).value).toBe('8');
    expect(within(restoredEditor).getByRole('button', { name: 'Show Keyboard' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: '← Previous section' }));
    expect(screen.getByText('Temporary test step 1')).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Option B' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Confidence 4' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Next section →' }));
    await user.click(screen.getByRole('button', { name: 'Next section →' }));
    expect(await screen.findByRole('heading', { name: 'Lesson summary' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Review lesson' }));
    expect(screen.getByRole('heading', { name: 'First sample concept' })).toBeVisible();
    expect(readLessonProgress(bank, VERSION).progressById['SAMPLE-1.1']).toMatchObject({ currentConceptIndex: 0, summaryOpen: false });

    cleanup();
    const reviewReloadStore = makeStore(Object.assign(initialState(), { doc: structuredClone(originalSession) }));
    render(<Provider store={reviewReloadStore}><App initialBank={{ bank, version: VERSION }} /></Provider>);
    await openLessonPicker(user);
    await user.click(within(screen.getByRole('dialog', { name: 'Lessons' })).getByRole('button', { name: /Sample lesson.*Learning/ }));
    expect(await screen.findByRole('heading', { name: 'First sample concept' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Next section →' }));
    await user.click(screen.getByRole('button', { name: 'Next section →' }));
    expect(await screen.findByRole('heading', { name: 'Lesson summary' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Start practice' }));
    await waitFor(() => expect(screen.getByText('Sample practice 1.')).toBeVisible());
    expect(readLessonProgress(bank, VERSION).progressById['SAMPLE-1.1'].status).toBe('practising');
    expect(reviewReloadStore.getState().doc.exercises.map(question => question.bankQuestionId)).toEqual([
      'SAMPLE-1.1-P01', 'SAMPLE-1.1-P02', 'SAMPLE-1.1-P03',
    ]);
    expect(readArchive()).toHaveLength(1);
    expect(withoutTimer(JSON.parse(readArchive()[0].data).doc)).toEqual(withoutTimer(originalSession));

    const practiceSession = structuredClone(reviewReloadStore.getState().doc);
    cleanup();
    const afterPracticeReload = makeStore(Object.assign(initialState(), { doc: practiceSession }));
    render(<Provider store={afterPracticeReload}><App initialBank={{ bank, version: VERSION }} /></Provider>);
    const lastQuestionId = afterPracticeReload.getState().doc.exercises.at(-1)!.id;
    fireEvent.change(screen.getByRole('combobox', { name: 'Select question' }), { target: { value: lastQuestionId } });
    await user.click(screen.getByRole('button', { name: 'Finish session' }));
    const confidence = screen.getByRole('dialog', { name: /confidence/i });
    await user.click(within(confidence).getByRole('radio', { name: 'Medium' }));
    await user.click(within(confidence).getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(readLessonProgress(bank, VERSION).progressById['SAMPLE-1.1'].status).toBe('done'));
    expect(readArchive()).toHaveLength(1);
    expect(serialize(afterPracticeReload.getState())).not.toContain('Option B');
    expect(serialize(afterPracticeReload.getState())).not.toContain('SAMPLE-1.1-L02');
  }, 15000);

  it('stores lesson identity and version with progress so another version starts independently', () => {
    const bank = fixture(), state = readLessonProgress(bank, VERSION);
    expect(state).toMatchObject({ bankId: 'sample-lessons', bankVersion: VERSION, progressById: {} });
    const otherVersion = readLessonProgress(bank, 'sample-v2-phase4');
    expect(otherVersion.progressById).toEqual({});
    expect(lessonProgressStorageKey(bank.bank_id, VERSION)).not.toBe(lessonProgressStorageKey(bank.bank_id, 'sample-v2-phase4'));
  });
});
