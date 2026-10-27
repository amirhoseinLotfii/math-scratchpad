import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from '../../src/app/store-provider';
import { App } from '../../src/App';
import { actions, initialState, makeStore } from '../../src/store';
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const execDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand');
afterEach(() => {
 cleanup(); vi.restoreAllMocks();
 if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor); else delete (navigator as any).clipboard;
 if (execDescriptor) Object.defineProperty(document, 'execCommand', execDescriptor); else delete (document as any).execCommand;
});
function mount() {
 const store = makeStore(initialState());
 store.dispatch(actions.startFractionRound());
 store.dispatch(actions.keyboard(true));
 render(<Provider store={store}><App /></Provider>);
 return store;
}
describe('Approved mobile batch workflow', () => {
 it('keeps confidence out of the editing page and asks before moving forward', async () => {
  const store = mount();
  expect(screen.queryAllByRole('radio')).toHaveLength(0);
  const id = store.getState().doc.exerciseId;
  await userEvent.click(screen.getByRole('button', { name: /Next question/i }));
  const dialog = screen.getByRole('dialog', { name: /confidence/i });
  expect(store.getState().doc.exerciseId).toBe(id);
  await userEvent.click(within(dialog).getByRole('button', { name: /continue/i }));
  expect(store.getState().doc.exerciseId).toBe(id);
  await userEvent.click(within(dialog).getByRole('radio', { name: 'High' }));
  await userEvent.click(within(dialog).getByRole('button', { name: /continue/i }));
  expect(store.getState().doc.exercises[0].confidence).toBe('high');
  expect(store.getState().doc.exerciseId).not.toBe(id);
 });
 it('makes review and full-session export available from the batch menu', async () => {
  mount();
  expect(screen.queryByRole('button', { name: 'Check · Copy for Review' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Exercise menu' }));
  expect(screen.getByRole('menuitem', { name: 'Check · Copy for Review' })).toBeTruthy();
  expect(screen.getByRole('menuitem', { name: /^Copy full session JSON/ })).toBeTruthy();
 });
 it('opens completion actions after final-question confidence without silently copying', async () => {
  const store = mount();
  fireEvent.change(screen.getByRole('combobox', { name: 'Current exercise' }), { target: { value: store.getState().doc.exercises.at(-1)!.id } });
  await userEvent.click(screen.getByRole('button', { name: /Finish session/i }));
  const confidence = screen.getByRole('dialog', { name: /confidence/i });
  await userEvent.click(within(confidence).getByRole('radio', { name: 'Medium' }));
  await userEvent.click(within(confidence).getByRole('button', { name: /continue/i }));
  const completion = screen.getByRole('dialog', { name: /session complete/i });
  expect(within(completion).getByRole('button', { name: 'Copy full session JSON' })).toBeTruthy();
  expect(within(completion).getByRole('button', { name: 'Check · Copy for Review' })).toBeTruthy();
 });
});

describe('Confidence dialog cancellation', () => {
 it('Escape cancels navigation and restores the invoking button without discarding work', async () => {
  const store = mount();
  const before = store.getState().doc.exercises.map(({ elapsedMs, ...answer }) => answer);
  const next = screen.getByRole('button', { name: /Next question/i });
  next.focus(); await userEvent.click(next);
  const dialog = screen.getByRole('dialog', { name: /confidence/i });
  await userEvent.keyboard('[Escape]');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(store.getState().doc.exercises.map(({ elapsedMs, ...answer }) => answer)).toEqual(before);
  expect(document.activeElement).toBe(next);
 });
});

describe('Session copy and recovery', () => {
 it('copies a full valid session without asking for confidence or changing answers', async () => {
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  const store = mount();
  const before = JSON.stringify(store.getState().doc.exercises);
  await userEvent.click(screen.getByRole('button', { name: 'Exercise menu' }));
  await userEvent.click(screen.getByRole('menuitem', { name: /^Copy full session JSON/ }));
  await vi.waitFor(() => expect(copy).toHaveBeenCalledTimes(1));
  const data = JSON.parse(copy.mock.calls[0][0]);
  expect(data.doc.exercises).toEqual(store.getState().doc.exercises);
  expect(JSON.stringify(store.getState().doc.exercises)).toBe(before);
  expect(screen.queryByRole('dialog', { name: /confidence/i })).toBeNull();
 });
 it('offers selectable JSON when clipboard is blocked', async () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } });
  Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) });
  mount();
  await userEvent.click(screen.getByRole('button', { name: 'Exercise menu' }));
  await userEvent.click(screen.getByRole('menuitem', { name: /^Copy full session JSON/ }));
  const field = await screen.findByRole('textbox', { name: /session JSON/i });
  expect(JSON.parse((field as HTMLTextAreaElement).value).doc.exercises).toHaveLength(20);
 });
 it('returns to a previous answer without clearing confidence, steps or recorded time', async () => {
  const store = mount();
  store.dispatch(actions.setConfidence('high'));
  store.dispatch(actions.command({ type: 'digit', value: '8' }));
  const first = store.getState().doc.exercises[0];
  act(() => store.dispatch(actions.adjacentExercise(1)));
  await userEvent.click(screen.getByRole('button', { name: /Previous/i }));
  const returned = store.getState().doc.exercises[0];
  expect(returned.steps).toEqual(first.steps);
  expect(returned.confidence).toBe(first.confidence);
  expect(returned.elapsedMs ?? 0).toBeGreaterThanOrEqual(first.elapsedMs ?? 0);
  expect(store.getState().doc.exerciseId).toBe(store.getState().doc.exercises[0].id);
 });
});
