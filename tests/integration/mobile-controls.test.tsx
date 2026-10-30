import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from '../../src/app/store-provider';
import { App } from '../../src/App';
import { actions, exerciseOf, initialState, makeStore } from '../../src/store';
import { latex } from '../../src/model';
afterEach(cleanup);
function mount(batch = true) {
 const store = makeStore(initialState());
 if (batch) store.dispatch(actions.startFractionRound());
 store.dispatch(actions.keyboard(true));
 render(<Provider store={store}><App /></Provider>);
 return store;
}
describe('Mobile step controls', () => {
 it('Add step appends one blank step and selects it', () => {
  const store = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
  const ex = exerciseOf(store.getState().doc);
  expect(ex.steps).toHaveLength(2); expect(latex(ex.steps[1].expression)).toBe('\\square');
  expect(store.getState().doc.cursor.stepId).toBe(ex.steps[1].id);
 });
 it('first-step delete is disabled even after adding later steps', () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
  expect((screen.getByRole('button', { name: 'Delete Step 1' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Delete Step 2' }) as HTMLButtonElement).disabled).toBe(false);
 });
 it('reset targets the named step rather than whichever step was active', () => {
  const store = mount();
  act(() => { store.dispatch(actions.command({ type: 'digit', value: '5' })); store.dispatch(actions.command({ type: 'newStep' })); store.dispatch(actions.command({ type: 'digit', value: '8' })); });
  fireEvent.click(screen.getByRole('button', { name: 'Reset Step 1' }));
  const steps = exerciseOf(store.getState().doc).steps;
  expect(latex(steps[0].expression)).toBe('\\square'); expect(latex(steps[1].expression)).toBe('8');
 });
 it('deleting a middle step preserves the surrounding steps and renumbers their accessible controls', () => {
  const store = mount();
  act(() => { store.dispatch(actions.command({ type: 'newStep' })); store.dispatch(actions.command({ type: 'newStep' })); });
  const ids = exerciseOf(store.getState().doc).steps.map(x => x.id);
  fireEvent.click(screen.getByRole('button', { name: 'Delete Step 2' }));
  expect(exerciseOf(store.getState().doc).steps.map(x => x.id)).toEqual([ids[0], ids[2]]);
  expect(screen.queryByRole('button', { name: 'Delete Step 3' })).toBeNull();
 });
});
describe('Quick tools and numeric keypad', () => {
 it('exposes the approved quick-tool order through accessible names', () => {
  mount();
  const buttons = within(screen.getByRole('group', { name: 'Quick math tools' })).getAllByRole('button');
  expect(buttons.map(x => x.getAttribute('aria-label'))).toEqual(['Insert fraction', 'Insert parentheses', 'Insert square root', 'Insert power', 'Insert equals']);
 });
 it.each([['Insert fraction', '\\frac'], ['Insert parentheses', '('], ['Insert square root', '\\sqrt'], ['Insert power', '^']])('%s inserts its mathematical structure into active step', (label, notation) => {
  const store = mount(); fireEvent.click(screen.getByRole('button', { name: label }));
  expect(latex(exerciseOf(store.getState().doc).steps[0].expression)).toContain(notation);
 });
 it('keypad presents all digits once, in ascending row order', () => {
  mount(); const area = screen.getByLabelText('Numeric keys');
  const digits = within(area).getAllByRole('button').map(x => x.textContent).filter(x => /^\d$/.test(x ?? ''));
  expect(digits).toEqual(['1','2','3','4','5','6','7','8','9','0']);
 });
 it('touch typing edits current step without changing the original question', () => {
  const store = mount(), source = exerciseOf(store.getState().doc).source;
  const keypad = within(screen.getByLabelText('Numeric keys'));
  for (const name of ['1','2','3']) fireEvent.click(keypad.getByRole('button', { name }));
  expect(latex(exerciseOf(store.getState().doc).steps[0].expression)).toBe('123');
  expect(exerciseOf(store.getState().doc).source).toBe(source);
 });
 it('Backspace removes one digit from the active input', () => {
  const store = mount(); act(() => { for (const value of '123') store.dispatch(actions.command({ type: 'digit', value })); });
  fireEvent.click(screen.getByRole('button', { name: 'Backspace' }));
  expect(latex(exerciseOf(store.getState().doc).steps[0].expression)).toBe('12');
 });
 it('More tools opens editing actions without resetting the active caret', () => {
  const store = mount(), before = store.getState().doc.cursor;
  fireEvent.click(screen.getByRole('button', { name: 'More tools' }));
  expect(within(document.querySelector('.editing-tools')!).getByRole('button', { name: 'Undo' })).toBeTruthy();
  expect(store.getState().doc.cursor).toEqual(before);
 });
});
describe('English interface, question RTL and single-question mode', () => {
 it('keeps only question prose RTL/Persian', () => {
  mount(); const main = document.querySelector('main')!;
  expect(main.lang).toBe('en');
  const prompt = document.querySelector('.question-statement')!;
  expect(prompt.getAttribute('lang')).toBe('fa'); expect(prompt.getAttribute('dir')).toBe('rtl');
  const ui = [...main.querySelectorAll('button, label, legend, [role="status"]')];
  expect(ui.filter(x => /[\u0600-\u06ff]/.test(x.textContent ?? ''))).toEqual([]);
 });
 it('single-question mode keeps primary review on the page and does not display batch navigation', () => {
  mount(false);
  expect(screen.getByRole('button', { name: 'Check · Copy for Review' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Next question/i })).toBeNull();
 });
 it('menu can close without changing work and remains available after switching questions', () => {
  const store = mount(), before = store.getState().doc.exercises;
  const menu = screen.getByRole('button', { name: 'Exercise menu' });
  fireEvent.click(menu); fireEvent.click(menu);
  expect(screen.queryByRole('button', { name: 'Copy full session JSON' })).toBeNull();
  expect(store.getState().doc.exercises).toEqual(before);
  act(() => store.dispatch(actions.adjacentExercise(1)));
  fireEvent.click(menu); fireEvent.click(screen.getByRole('menuitem', { name: 'Show more' })); expect(screen.getByRole('menuitem', { name: /^Copy full session JSON/ })).toBeTruthy();
 });
});
