import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Provider } from '../../src/app/store-provider';
import { App } from '../../src/app/app';
import { actions, exerciseOf, initialState, makeStore } from '../../src/store';
import { latex } from '../../src/model';
import { parse } from '../../src/parser';
import { serialize, validateSession } from '../../src/persistence';
import { bankDocument, validateBank } from '../../src/features/drive-bank/drive-bank';
import { buildTutorExport } from '../../src/features/session/export/tutor-export';
import { reviewPayload } from '../../src/review';

function viewport(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    matches: width >= Number(query.match(/min-width:\s*(\d+)/)?.[1] ?? Infinity),
    addEventListener() {},
    removeEventListener() {},
  }));
}
function mount({
  width = 1920,
  store = (() => {
    const s = makeStore(initialState());
    s.dispatch(actions.startFractionRound());
    return s;
  })(),
} = {}) {
  viewport(width);
  const view = render(
    <div id="math-scratchpad-redux">
      <Provider store={store}>
        <App />
      </Provider>
    </div>,
  );
  return { store, user: userEvent.setup(), ...view };
}
const BANK = {
  schema_version: 'math-scratchpad.bank/1.0',
  bank_id: 'T',
  version: 'v1',
  questions: [
    { id: 'G1', mode: 'math', source: '1+2', guidance: 'به ترتیب عملیات فکر کن.' },
    { id: 'N1', mode: 'text', source: 'متن' },
  ],
};
function bankStore() {
  const s = makeStore(initialState());
  s.dispatch(actions.load({ doc: bankDocument(validateBank(BANK), 'v1-x') }));
  return s;
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (globalThis as { __askWellbeing?: boolean }).__askWellbeing;
});

describe('7 anxiety/energy once per batch', () => {
  it('asks once at batch start, applies to the session and survives reload; never invents values', async () => {
    (globalThis as { __askWellbeing?: boolean }).__askWellbeing = true;
    const { store, user, unmount } = mount();
    const dialog = screen.getByRole('dialog', { name: 'Before you start this batch' });
    expect(within(dialog).getByText('Optional. You can change this later.')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('radiogroup')).toHaveLength(2);
    expect(within(dialog).getAllByRole('radio')).toHaveLength(10);
    expect(store.getState().doc.session?.anxiety).toBeUndefined();
    await user.click(within(within(dialog).getByRole('radiogroup', { name: 'Math anxiety' })).getByRole('radio', { name: '3' }));
    expect(screen.getByRole('dialog', { name: 'Before you start this batch' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Start' }));
    expect(store.getState().doc.session).toMatchObject({ anxiety: 3 });
    expect(store.getState().doc.session?.energy).toBeUndefined();
    act(() => {
      store.dispatch(actions.adjacentExercise(1));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    const saved = serialize(store.getState());
    unmount();
    const st = initialState();
    st.doc = validateSession(JSON.parse(saved)).doc;
    mount({ store: makeStore(st) });
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Exercise menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Show more' }));
    await user.click(screen.getByRole('menuitem', { name: 'Session details' }));
    const details = screen.getByRole('group', { name: 'Session details' });
    expect(within(details).getByText('Math anxiety')).toBeInTheDocument();
    expect(within(details).getByText('3')).toBeInTheDocument();
    expect(within(details).getByText('Energy')).toBeInTheDocument();
    expect(within(details).getByText('Not set')).toBeInTheDocument();
  });
  it('Skip for now records nothing and does not re-ask in the same batch', async () => {
    (globalThis as { __askWellbeing?: boolean }).__askWellbeing = true;
    const { store, user, unmount } = mount();
    await user.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(store.getState().doc.session?.anxiety).toBeUndefined();
    unmount();
    mount({ store });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('a session that already has values is never interrupted', () => {
    (globalThis as { __askWellbeing?: boolean }).__askWellbeing = true;
    const s = makeStore(initialState());
    s.dispatch(actions.startFractionRound());
    s.dispatch(actions.setSessionMeta({ anxiety: 2, energy: 4 }));
    mount({ store: s });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('keeps both scale values unset or stores both explicit selections', async () => {
    (globalThis as { __askWellbeing?: boolean }).__askWellbeing = true;
    const { store, user } = mount();
    const dialog = screen.getByRole('dialog', { name: 'Before you start this batch' });
    for (const radio of within(dialog).getAllByRole('radio')) expect(radio).toHaveAttribute('aria-checked', 'false');
    const anxiety = within(within(dialog).getByRole('radiogroup', { name: 'Math anxiety' }));
    const energy = within(within(dialog).getByRole('radiogroup', { name: 'Energy' }));
    await user.click(anxiety.getByRole('radio', { name: '2' }));
    await user.click(energy.getByRole('radio', { name: '5' }));
    expect(anxiety.getByRole('radio', { name: '2' })).toHaveAttribute('aria-checked', 'true');
    expect(energy.getByRole('radio', { name: '5' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(dialog).getByRole('button', { name: 'Start' }));
    expect(store.getState().doc.session).toMatchObject({ anxiety: 2, energy: 5 });
  });
});

describe('8 question guidance', () => {
  it('bank guidance is optional and backward compatible', () => {
    expect(validateBank(BANK).questions[0].guidance).toBeTruthy();
    expect(validateBank(BANK).questions[1]).not.toHaveProperty('guidance');
    expect(() => validateBank({ ...BANK, questions: [{ id: 'X', mode: 'math', source: '1', guidance: 5 }] })).toThrow();
    const sanitized = validateBank({ ...BANK, questions: [{ id: 'X', mode: 'math', source: '1', solution: 'x' }] });
    expect(sanitized.questions[0]).not.toHaveProperty('solution');
    expect(sanitized.parseWarnings?.join(' ')).toContain('solution');
  });
  it('opening marks helped permanently; closing keeps it; exports accurately; no guidance → no area', async () => {
    const store = bankStore();
    const { user } = mount({ store });
    const summary = screen.getByText('Question guidance');
    const details = summary.closest('details')!;
    expect(details.open).toBe(false);
    expect(buildTutorExport(store.getState().doc).items[0]).toMatchObject({
      independent: true,
      guidance_opened: false,
      guidance_available: true,
    });
    await user.click(summary);
    expect(details.open).toBe(true);
    const at = exerciseOf(store.getState().doc).guidanceOpenedAt;
    expect(at).toBeTruthy();
    await user.click(summary);
    expect(exerciseOf(store.getState().doc).guidanceOpenedAt).toBe(at);
    const item = buildTutorExport(store.getState().doc).items[0];
    expect(item).toMatchObject({ hint_used: true, independent: false, guidance_opened: true, guidance_opened_at: at });
    expect(reviewPayload(store.getState().doc)).toMatchObject({ helpUsed: true, guidanceOpened: true });
    expect(JSON.stringify(buildTutorExport(store.getState().doc))).not.toContain('ترتیب عملیات'); // guidance text not exported
    act(() => {
      store.dispatch(actions.adjacentExercise(1));
    });
    expect(screen.queryByText('Question guidance')).toBeNull();
    const restored = validateSession(JSON.parse(serialize(store.getState()))).doc;
    expect(restored.exercises[0].guidanceOpenedAt).toBe(at);
  });
});

describe('9 auto-Final on Next/Finish', () => {
  async function confirm(user: ReturnType<typeof userEvent.setup>, button: RegExp) {
    await user.click(screen.getByRole('button', { name: button }));
    const d = screen.getByRole('dialog', { name: /confidence/i });
    await user.click(within(d).getByRole('radio', { name: 'Medium' }));
    await user.click(within(d).getByRole('button', { name: /continue/i }));
  }
  it('marks the last non-empty step Final, keeping all steps and the submission time', async () => {
    const { store, user } = mount({ width: 390 });
    const main = screen.getByRole('main');
    fireEvent.keyDown(main, { key: '7' });
    fireEvent.keyDown(main, { key: 'Enter' });
    fireEvent.keyDown(main, { key: '8' });
    fireEvent.keyDown(main, { key: 'Enter' });
    await confirm(user, /Next question/);
    const ex = store.getState().doc.exercises[0];
    expect(ex.steps.map((s) => [latex(s.expression), s.final])).toEqual([
      ['7', false],
      ['8', true],
      ['\\square', false],
    ]);
    expect(ex.submittedAt).toBeTruthy();
    expect(ex.confidence).toBe('medium');
  });
  it('keeps an explicit Final', async () => {
    const { store, user } = mount({ width: 390 });
    const main = screen.getByRole('main');
    fireEvent.keyDown(main, { key: '7' });
    fireEvent.keyDown(main, { key: 'Enter', altKey: true });
    fireEvent.keyDown(main, { key: 'Enter' });
    fireEvent.keyDown(main, { key: '9' });
    await confirm(user, /Next question/);
    expect(store.getState().doc.exercises[0].steps.map((s) => s.final)).toEqual([true, false]);
  });
  it('never marks an empty or skipped question', async () => {
    const { store, user } = mount({ width: 390 });
    await confirm(user, /Next question/);
    expect(store.getState().doc.exercises[0].steps.some((s) => s.final)).toBe(false);
    act(() => {
      store.dispatch(actions.command({ type: 'digit', value: '2' }));
      store.dispatch(actions.setSkipped(true));
    });
    await user.click(screen.getByRole('button', { name: /Next question/ }));
    expect(store.getState().doc.exercises[1].steps.some((s) => s.final)).toBe(false);
    expect(buildTutorExport(store.getState().doc).items[1].status).toBe('skipped');
  });
  it('applies at the last question’s Finish action', async () => {
    const s = makeStore(initialState());
    s.dispatch(actions.startFractionRound());
    const last = s.getState().doc.exercises.at(-1)!.id;
    s.dispatch(actions.switchExercise(last));
    const { store, user } = mount({ width: 390, store: s });
    fireEvent.keyDown(screen.getByRole('main'), { key: '3' });
    await confirm(user, /Finish session/);
    expect(exerciseOf(store.getState().doc).steps[0].final).toBe(true);
  });
});

describe('10/migration: existing in-progress sessions', () => {
  it('a pre-change draft (no new fields) restores unchanged, keeps its time, and gains no invented data', () => {
    const s = makeStore(initialState());
    s.dispatch(actions.startFractionRound());
    s.dispatch(actions.command({ type: 'operator', value: '+' }));
    s.dispatch(actions.command({ type: 'digit', value: '6' }));
    const legacy = JSON.parse(serialize(s.getState()));
    const ex0 = legacy.doc.exercises[0];
    ex0.elapsedMs = 90000;
    delete ex0.timerRunningSince;
    const doc = validateSession(legacy).doc;
    expect(doc.exercises[0].steps.map((x) => latex(x.expression))).toEqual(['+6']);
    expect(doc.exercises[0]).toMatchObject({ elapsedMs: 90000 });
    expect(doc.exercises[0].guidanceOpenedAt).toBeUndefined();
    expect(doc.exercises[0].confidence).toBeUndefined();
    expect(doc.session?.anxiety).toBeUndefined();
    expect(doc.exercises).toHaveLength(20);
  });
  it('bankDocument carries guidance only for questions that have it', () => {
    const doc = bankDocument(validateBank(BANK), 'v');
    expect(doc.exercises[0].guidance).toBeTruthy();
    expect(doc.exercises[1]).not.toHaveProperty('guidance');
    void parse;
  });
});
