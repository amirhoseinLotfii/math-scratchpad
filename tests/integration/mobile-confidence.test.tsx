import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from '../../src/app/store-provider';
import { App } from '../../src/App';
import { actions, initialState, makeStore } from '../../src/store';
afterEach(cleanup);
function mount() { const s = makeStore(initialState()); s.dispatch(actions.startFractionRound()); render(<Provider store={s}><App /></Provider>); return s; }
async function open() { await userEvent.click(screen.getByRole('button', { name: /Next question/i })); return screen.getByRole('dialog', { name: /confidence/i }); }
describe('Confidence decision boundaries', () => {
 it.each([['Low','low'], ['Medium','medium'], ['High','high']])('commits %s only on explicit Continue', async (label, value) => {
  const s = mount(), dialog = await open(), first = s.getState().doc.exerciseId;
  expect((within(dialog).getByRole('radio', { name: 'High' }) as HTMLInputElement).checked).toBe(true);
  await userEvent.click(within(dialog).getByRole('radio', { name: label }));
  expect(s.getState().doc.exerciseId).toBe(first);
  await userEvent.click(within(dialog).getByRole('button', { name: /continue/i }));
  expect(s.getState().doc.exercises[0].confidence).toBe(value);
  expect(s.getState().doc.exerciseId).not.toBe(first);
 });
 it('Cancel abandons a draft choice and preserves the original answer', async () => {
  const s = mount(), before = s.getState().doc, dialog = await open();
  await userEvent.click(within(dialog).getByRole('radio', { name: 'High' }));
  await userEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
  expect(s.getState().doc.exerciseId).toBe(before.exerciseId);
  expect(s.getState().doc.cursor).toEqual(before.cursor);
  expect(s.getState().doc.exercises.map(({ elapsedMs, ...answer }) => answer)).toEqual(before.exercises.map(({ elapsedMs, ...answer }) => answer));
 });
 it('reopens an existing confidence for review instead of clearing it', async () => {
  const s = mount(); act(() => s.dispatch(actions.setConfidence('medium')));
  const dialog = await open();
  expect((within(dialog).getByRole('radio', { name: 'Medium' }) as HTMLInputElement).checked).toBe(true);
 });
 it('rapid repeated Continue cannot skip a question', async () => {
  const s = mount(), dialog = await open();
  await userEvent.click(within(dialog).getByRole('radio', { name: 'High' }));
  const button = within(dialog).getByRole('button', { name: /continue/i });
  await userEvent.click(button); await userEvent.click(button);
  expect(s.getState().doc.exerciseId).toBe(s.getState().doc.exercises[1].id);
 });
 it('first-question Previous is disabled', async () => {
  mount(); expect((screen.getByRole('button', { name: /Previous/i }) as HTMLButtonElement).disabled).toBe(true);
 });
 it('final-question navigation exposes Finish rather than an out-of-bounds Next', async () => {
  const s = mount(); act(() => s.dispatch(actions.switchExercise(s.getState().doc.exercises.at(-1)!.id)));
  expect(screen.getByRole('button', { name: /Finish session/i })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Next question/i })).toBeNull();
 });
});

describe('Skipped batch questions', () => {
 it('allows explicit skipped questions to advance without inventing confidence', async () => {
  const s = mount(); act(() => s.dispatch(actions.setSkipped(true)));
  await userEvent.click(screen.getByRole('button', { name: /Next question/i }));
  expect(s.getState().doc.exerciseId).toBe(s.getState().doc.exercises[1].id);
  expect(s.getState().doc.exercises[0].confidence).toBeUndefined();
  expect(s.getState().doc.exercises[0].skipped).toBe(true);
 });
});
