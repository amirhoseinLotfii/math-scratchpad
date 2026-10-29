import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Provider } from '../../src/app/store-provider';
import { App, INSERT_VISIBLE } from '../../src/App';
import { actions, exerciseOf, initialState, makeStore } from '../../src/store';
import { latex } from '../../src/model';
import { parse } from '../../src/parser';
import { serialize, validateSession } from '../../src/persistence';
import { bankDocument, validateBank } from '../../src/features/drive-bank/drive-bank';
import { buildTutorExport } from '../../src/features/session/export/tutor-export';
import { reviewPayload } from '../../src/review';
import { UI_PREFS_PREFIX } from '../../src/shared/lib/ui-prefs';

function viewport(width: number) {
 vi.stubGlobal('matchMedia', (query: string) => ({ media: query, matches: width >= Number(query.match(/min-width:\s*(\d+)/)?.[1] ?? Infinity), addEventListener() {}, removeEventListener() {} }));
}
function mount({ width = 1920, store = (() => { const s = makeStore(initialState()); s.dispatch(actions.startFractionRound()); return s; })() } = {}) {
 viewport(width);
 const view = render(<div id="math-scratchpad-redux"><Provider store={store}><App /></Provider></div>);
 return { store, user: userEvent.setup(), ...view };
}
const BANK = { schema_version: 'math-scratchpad.bank/1.0', bank_id: 'T', version: 'v1', questions: [
 { id: 'G1', mode: 'math', source: '1+2', guidance: 'به ترتیب عملیات فکر کن.' }, { id: 'N1', mode: 'text', source: 'متن' }] };
function bankStore() { const s = makeStore(initialState()); s.dispatch(actions.load({ doc: bankDocument(validateBank(BANK), 'v1-x') })); return s; }
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); delete (globalThis as { __askWellbeing?: boolean }).__askWellbeing; });

describe('1–2 persisted panels', () => {
 it('Questions panel collapses with an accessible toggle and stays collapsed across navigation and remount', async () => {
  const { user, store, unmount } = mount(); const nav = screen.getByRole('navigation', { name: 'Questions' });
  const toggle = within(nav).getByRole('button', { name: 'Collapse questions panel' }); expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await user.click(toggle); expect(nav.querySelector('ol')).not.toBeVisible(); expect(localStorage.getItem(UI_PREFS_PREFIX + 'questions')).toBe('0');
  act(() => { store.dispatch(actions.adjacentExercise(1)); });
  expect(within(nav).getByRole('button', { name: 'Expand questions panel' })).toHaveAttribute('aria-expanded', 'false');
  unmount(); mount(); expect(screen.getByRole('button', { name: 'Expand questions panel' })).toBeInTheDocument();
 });
 it('keeps session details in the expanded menu and puts shortcuts under Help', async () => {
  const { user } = mount();
  expect(screen.queryByText('Session details')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Keyboard shortcuts' })).toBeNull();
  expect(document.querySelector('.session-panel')).toBeNull();
  expect(screen.getByLabelText('Question elapsed time')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Exercise menu' }));
  expect(screen.queryByRole('menuitem', { name: 'Session details' })).toBeNull();
  await user.click(screen.getByRole('menuitem', { name: 'Show more' }));
  await user.click(screen.getByRole('menuitem', { name: 'Session details' }));
  const sessionDetails = screen.getByRole('group', { name: 'Session details' });
  expect(within(sessionDetails).getByText('Session ID')).toBeInTheDocument();
  expect(within(sessionDetails).getByText('Math anxiety')).toBeInTheDocument();
  expect(within(sessionDetails).getByText('Energy')).toBeInTheDocument();
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: 'Exercise menu' }));
  await user.click(screen.getByRole('menuitem', { name: 'Show more' }));
  await user.click(screen.getByRole('menuitem', { name: 'Keyboard shortcuts' }));
  expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  expect(localStorage.getItem(UI_PREFS_PREFIX + 'session-details')).toBeNull();
 });
 it('still works in memory when localStorage throws', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  const { user } = mount(); await user.click(screen.getByRole('button', { name: 'Collapse questions panel' }));
  expect(screen.getByRole('button', { name: 'Expand questions panel' })).toBeInTheDocument();
 });
});

describe('3 confidence dialog focus', () => {
 it('focuses the dialog, not Low, and selects nothing', async () => {
  const { user } = mount({ width: 390 }); await user.click(screen.getByRole('button', { name: /Next question/ }));
  const dialog = screen.getByRole('dialog', { name: /confidence/i });
  expect(document.activeElement).toBe(dialog); expect(within(dialog).getByRole('radio', { name: 'Low' })).not.toHaveFocus();
  for (const r of within(dialog).getAllByRole('radio')) expect(r).not.toBeChecked();
  await user.tab(); expect(within(dialog).getByRole('radio', { name: 'Low' })).toHaveFocus(); expect(within(dialog).getByRole('radio', { name: 'Low' })).not.toBeChecked();
 });
});

describe('4 Enter creates a step', () => {
 it('Enter in the editor adds and focuses a blank step; Alt+Enter still marks Final', () => {
  const { store } = mount(); const main = screen.getByRole('main');
  fireEvent.keyDown(main, { key: '5' }); fireEvent.keyDown(main, { key: 'Enter', altKey: true });
  expect(exerciseOf(store.getState().doc).steps[0].final).toBe(true); expect(exerciseOf(store.getState().doc).steps).toHaveLength(1);
  fireEvent.keyDown(main, { key: 'Enter' });
  const ex = exerciseOf(store.getState().doc); expect(ex.steps).toHaveLength(2); expect(store.getState().doc.cursor.stepId).toBe(ex.steps[1].id);
  expect(latex(ex.steps[1].expression)).toBe('\\square'); expect(main).toHaveFocus();
  fireEvent.keyDown(main, { key: 'z', ctrlKey: true }); expect(exerciseOf(store.getState().doc).steps).toHaveLength(1);
 });
 it('Enter on buttons, selects and dialogs is not intercepted', async () => {
  const { store, user } = mount({ width: 1440 });
  fireEvent.keyDown(within(screen.getByRole('navigation', { name: 'Questions' })).getByRole('button', { name: 'Question 1 Not started' }), { key: 'Enter' });
  fireEvent.keyDown(screen.getByRole('button', { name: 'Add step' }), { key: 'Enter' });
  expect(exerciseOf(store.getState().doc).steps).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'More math tools' })); const d = screen.getByRole('dialog', { name: 'Insert Math Element' });
  fireEvent.keyDown(within(d).getAllByRole('button')[0], { key: 'Enter' }); expect(exerciseOf(store.getState().doc).steps).toHaveLength(1);
 });
});

describe('5 insert dialog “نمایش بیشتر”', () => {
 it('shows 8 tools, expands to the full catalog, collapses again; arrows stay within visible tools', async () => {
  const { user } = mount(); await user.click(screen.getByRole('button', { name: 'More math tools' }));
  const d = screen.getByRole('dialog', { name: 'Insert Math Element' }), tools = () => d.querySelectorAll('[data-insert-kind]');
  expect(tools()).toHaveLength(INSERT_VISIBLE); expect(INSERT_VISIBLE).toBeGreaterThanOrEqual(6); expect(INSERT_VISIBLE).toBeLessThanOrEqual(8);
  expect(tools()[0]).toHaveFocus(); fireEvent.keyDown(tools()[0], { key: 'ArrowLeft' }); expect(tools()[INSERT_VISIBLE - 1]).toHaveFocus();
  const more = within(d).getByRole('button', { name: /نمایش بیشتر/ }); expect(more).toHaveAttribute('aria-expanded', 'false');
  await user.click(more); expect(tools().length).toBeGreaterThan(INSERT_VISIBLE); expect(within(d).getByRole('button', { name: 'Integral' })).toBeInTheDocument();
  await user.click(within(d).getByRole('button', { name: 'نمایش کمتر' })); expect(tools()).toHaveLength(INSERT_VISIBLE);
 });
 it('phone also gets a collapsed list with the full catalog reachable', async () => {
  const { user } = mount({ width: 390 }); fireEvent.keyDown(screen.getByRole('main'), { key: '/' });
  const d = screen.getByRole('dialog', { name: 'Insert Math Element' }); expect(d.querySelectorAll('[data-insert-kind]')).toHaveLength(INSERT_VISIBLE);
  await user.click(within(d).getByRole('button', { name: /نمایش بیشتر/ })); expect(d.querySelectorAll('[data-insert-kind]')).toHaveLength(10);
 });
});

describe('6 header progress', () => {
 it('separates answered from skipped and updates immediately', () => {
  const { store } = mount(); const header = () => document.querySelector('.header-progress-copy')!.textContent;
  expect(header()).toBe('0 of 20 answered');
  act(() => { store.dispatch(actions.command({ type: 'digit', value: '4' })); }); expect(header()).toBe('0 of 20 answered'); // draft is not answered
  act(() => { store.dispatch(actions.setConfidence('low')); }); expect(header()).toBe('1 of 20 answered');
  act(() => { store.dispatch(actions.adjacentExercise(1)); store.dispatch(actions.setSkipped(true)); }); expect(header()).toBe('1 of 20 answered · 1 skipped');
 });
});

describe('7 anxiety/energy once per batch', () => {
 it('asks once at batch start, applies to the session and survives reload; never invents values', async () => {
  (globalThis as { __askWellbeing?: boolean }).__askWellbeing = true;
  const { store, user, unmount } = mount(); const dialog = screen.getByRole('dialog', { name: 'Before you start this batch' });
  expect(within(dialog).getByText('Optional. You can change this later.')).toBeInTheDocument();
  expect(within(dialog).getAllByRole('radiogroup')).toHaveLength(2);
  expect(within(dialog).getAllByRole('radio')).toHaveLength(10);
  expect(store.getState().doc.session?.anxiety).toBeUndefined();
  await user.click(within(within(dialog).getByRole('radiogroup', { name: 'Math anxiety' })).getByRole('radio', { name: '3' })); expect(screen.getByRole('dialog', { name: 'Before you start this batch' })).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Start' }));
  expect(store.getState().doc.session).toMatchObject({ anxiety: 3 }); expect(store.getState().doc.session?.energy).toBeUndefined();
  act(() => { store.dispatch(actions.adjacentExercise(1)); }); expect(screen.queryByRole('dialog')).toBeNull();
  const saved = serialize(store.getState()); unmount();
  const st = initialState(); st.doc = validateSession(JSON.parse(saved)).doc; mount({ store: makeStore(st) });
  expect(screen.queryByRole('dialog')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Exercise menu' })); await user.click(screen.getByRole('menuitem', { name: 'Show more' }));
  await user.click(screen.getByRole('menuitem', { name: 'Session details' }));
  const details = screen.getByRole('group', { name: 'Session details' });
  expect(within(details).getByText('Math anxiety')).toBeInTheDocument();
  expect(within(details).getByText('3')).toBeInTheDocument();
  expect(within(details).getByText('Energy')).toBeInTheDocument();
  expect(within(details).getByText('Not set')).toBeInTheDocument();
 });
 it('Skip for now records nothing and does not re-ask in the same batch', async () => {
  (globalThis as { __askWellbeing?: boolean }).__askWellbeing = true;
  const { store, user, unmount } = mount(); await user.click(screen.getByRole('button', { name: 'Skip for now' }));
  expect(store.getState().doc.session?.anxiety).toBeUndefined(); unmount(); mount({ store }); expect(screen.queryByRole('dialog')).toBeNull();
 });
 it('a session that already has values is never interrupted', () => {
  (globalThis as { __askWellbeing?: boolean }).__askWellbeing = true;
  const s = makeStore(initialState()); s.dispatch(actions.startFractionRound()); s.dispatch(actions.setSessionMeta({ anxiety: 2, energy: 4 }));
  mount({ store: s }); expect(screen.queryByRole('dialog')).toBeNull();
 });
 it('keeps both scale values unset or stores both explicit selections', async () => {
  (globalThis as { __askWellbeing?: boolean }).__askWellbeing = true;
  const { store, user } = mount(); const dialog = screen.getByRole('dialog', { name: 'Before you start this batch' });
  for (const radio of within(dialog).getAllByRole('radio')) expect(radio).toHaveAttribute('aria-checked', 'false');
  const anxiety = within(within(dialog).getByRole('radiogroup', { name: 'Math anxiety' }));
  const energy = within(within(dialog).getByRole('radiogroup', { name: 'Energy' }));
  await user.click(anxiety.getByRole('radio', { name: '2' })); await user.click(energy.getByRole('radio', { name: '5' }));
  expect(anxiety.getByRole('radio', { name: '2' })).toHaveAttribute('aria-checked', 'true');
  expect(energy.getByRole('radio', { name: '5' })).toHaveAttribute('aria-checked', 'true');
  await user.click(within(dialog).getByRole('button', { name: 'Start' }));
  expect(store.getState().doc.session).toMatchObject({ anxiety: 2, energy: 5 });
 });
});

describe('8 question guidance', () => {
 it('bank guidance is optional and backward compatible', () => {
  expect(validateBank(BANK).questions[0].guidance).toBeTruthy(); expect(validateBank(BANK).questions[1]).not.toHaveProperty('guidance');
  expect(() => validateBank({ ...BANK, questions: [{ id: 'X', mode: 'math', source: '1', guidance: 5 }] })).toThrow();
  expect(() => validateBank({ ...BANK, questions: [{ id: 'X', mode: 'math', source: '1', solution: 'x' }] })).toThrow(/پاسخ یا کلید/);
 });
 it('opening marks helped permanently; closing keeps it; exports accurately; no guidance → no area', async () => {
  const store = bankStore(); const { user } = mount({ store });
  const summary = screen.getByText('راهنمای سؤال'); const details = summary.closest('details')!; expect(details.open).toBe(false);
  expect(buildTutorExport(store.getState().doc).items[0]).toMatchObject({ independent: true, guidance_opened: false, guidance_available: true });
  await user.click(summary); expect(details.open).toBe(true);
  const at = exerciseOf(store.getState().doc).guidanceOpenedAt; expect(at).toBeTruthy();
  await user.click(summary); expect(exerciseOf(store.getState().doc).guidanceOpenedAt).toBe(at);
  const item = buildTutorExport(store.getState().doc).items[0];
  expect(item).toMatchObject({ hint_used: true, independent: false, guidance_opened: true, guidance_opened_at: at });
  expect(reviewPayload(store.getState().doc)).toMatchObject({ helpUsed: true, guidanceOpened: true });
  expect(JSON.stringify(buildTutorExport(store.getState().doc))).not.toContain('ترتیب عملیات'); // guidance text not exported
  act(() => { store.dispatch(actions.adjacentExercise(1)); }); expect(screen.queryByText('راهنمای سؤال')).toBeNull();
  const restored = validateSession(JSON.parse(serialize(store.getState()))).doc; expect(restored.exercises[0].guidanceOpenedAt).toBe(at);
 });
});

describe('9 auto-Final on Next/Finish', () => {
 async function confirm(user: ReturnType<typeof userEvent.setup>, button: RegExp) {
  await user.click(screen.getByRole('button', { name: button })); const d = screen.getByRole('dialog', { name: /confidence/i });
  await user.click(within(d).getByRole('radio', { name: 'Medium' })); await user.click(within(d).getByRole('button', { name: /continue/i }));
 }
 it('marks the last non-empty step Final, keeping all steps and the submission time', async () => {
  const { store, user } = mount({ width: 390 }); const main = screen.getByRole('main');
  fireEvent.keyDown(main, { key: '7' }); fireEvent.keyDown(main, { key: 'Enter' }); fireEvent.keyDown(main, { key: '8' }); fireEvent.keyDown(main, { key: 'Enter' });
  await confirm(user, /Next question/);
  const ex = store.getState().doc.exercises[0]; expect(ex.steps.map(s => [latex(s.expression), s.final])).toEqual([['7', false], ['8', true], ['\\square', false]]);
  expect(ex.submittedAt).toBeTruthy(); expect(ex.confidence).toBe('medium');
 });
 it('keeps an explicit Final', async () => {
  const { store, user } = mount({ width: 390 }); const main = screen.getByRole('main');
  fireEvent.keyDown(main, { key: '7' }); fireEvent.keyDown(main, { key: 'Enter', altKey: true }); fireEvent.keyDown(main, { key: 'Enter' }); fireEvent.keyDown(main, { key: '9' });
  await confirm(user, /Next question/); expect(store.getState().doc.exercises[0].steps.map(s => s.final)).toEqual([true, false]);
 });
 it('never marks an empty or skipped question', async () => {
  const { store, user } = mount({ width: 390 }); await confirm(user, /Next question/);
  expect(store.getState().doc.exercises[0].steps.some(s => s.final)).toBe(false);
  act(() => { store.dispatch(actions.command({ type: 'digit', value: '2' })); store.dispatch(actions.setSkipped(true)); });
  await user.click(screen.getByRole('button', { name: /Next question/ }));
  expect(store.getState().doc.exercises[1].steps.some(s => s.final)).toBe(false); expect(buildTutorExport(store.getState().doc).items[1].status).toBe('skipped');
 });
 it('applies at the last question’s Finish action', async () => {
  const s = makeStore(initialState()); s.dispatch(actions.startFractionRound()); const last = s.getState().doc.exercises.at(-1)!.id; s.dispatch(actions.switchExercise(last));
  const { store, user } = mount({ width: 390, store: s }); fireEvent.keyDown(screen.getByRole('main'), { key: '3' });
  await confirm(user, /Finish session/); expect(exerciseOf(store.getState().doc).steps[0].final).toBe(true);
 });
});

describe('10/migration: existing in-progress sessions', () => {
 it('a pre-change draft (no new fields) restores unchanged, keeps its time, and gains no invented data', () => {
  const s = makeStore(initialState()); s.dispatch(actions.startFractionRound()); s.dispatch(actions.command({ type: 'operator', value: '+' })); s.dispatch(actions.command({ type: 'digit', value: '6' }));
  const legacy = JSON.parse(serialize(s.getState())); const ex0 = legacy.doc.exercises[0]; ex0.elapsedMs = 90000; delete ex0.timerRunningSince;
  const doc = validateSession(legacy).doc; expect(doc.exercises[0].steps.map(x => latex(x.expression))).toEqual(['+6']);
  expect(doc.exercises[0]).toMatchObject({ elapsedMs: 90000 }); expect(doc.exercises[0].guidanceOpenedAt).toBeUndefined(); expect(doc.exercises[0].confidence).toBeUndefined();
  expect(doc.session?.anxiety).toBeUndefined(); expect(doc.exercises).toHaveLength(20);
 });
 it('bankDocument carries guidance only for questions that have it', () => {
  const doc = bankDocument(validateBank(BANK), 'v'); expect(doc.exercises[0].guidance).toBeTruthy(); expect(doc.exercises[1]).not.toHaveProperty('guidance');
  void parse;
 });
});
