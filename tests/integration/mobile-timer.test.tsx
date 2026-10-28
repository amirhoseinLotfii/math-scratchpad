import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from '../../src/app/store-provider';
import { QuestionTimer } from '../../src/QuestionTimer';
import { actions, initialState, makeStore } from '../../src/store';
import { elapsedAt } from '../../src/model';
import { serialize, validateSession } from '../../src/persistence';
const T0 = Date.UTC(2026, 9, 28, 12, 0, 0);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
function mount(store = (() => { const s = makeStore(initialState()); s.dispatch(actions.startFractionRound()); return s; })()) {
 const id = store.getState().doc.exerciseId;
 const view = render(<Provider store={store}><QuestionTimer exerciseId={id} /></Provider>);
 return { store, id, view, elapsed: () => elapsedAt(store.getState().doc.exercises.find(x => x.id === id)!) };
}
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
describe('Wall-clock question timer', () => {
 it('counts from persisted timestamps, not from interval ticks', () => {
  const x = mount(); expect(x.store.getState().doc.exercises[0].timerRunningSince).toBe(T0);
  tick(5000); expect(x.elapsed()).toBe(5000); expect(screen.getByLabelText('Question elapsed time').textContent).toBe('00:05');
  expect(x.store.getState().doc.exercises[0].elapsedMs ?? 0).toBe(0); // no per-second writes
 });
 it('keeps counting while the tab is hidden and refreshes on visibility return', () => {
  let hidden = false; vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  const x = mount(); hidden = true; fireEvent(document, new Event('visibilitychange'));
  vi.setSystemTime(T0 + 60000); hidden = false; act(() => { fireEvent(document, new Event('visibilitychange')); });
  expect(x.elapsed()).toBe(60000); expect(screen.getByLabelText('Question elapsed time').textContent).toBe('01:00');
 });
 it('blur/pagehide do not stop the clock', () => {
  const x = mount(); fireEvent.blur(window); fireEvent(window, new Event('pagehide')); tick(3000); expect(x.elapsed()).toBe(3000);
 });
 it('survives a reload: time while closed is counted after restore', () => {
  const x = mount(); tick(2000); const saved = serialize(x.store.getState()); x.view.unmount(); cleanup();
  vi.setSystemTime(T0 + 2000 + 10 * 60000); // tab closed for ten minutes
  const restored = initialState(); restored.doc = validateSession(JSON.parse(saved)).doc;
  const y = mount(makeStore(restored)); expect(y.elapsed()).toBe(2000 + 10 * 60000);
 });
 it('Pause closes the segment; paused time is not counted, even across reload', () => {
  const x = mount(); tick(4000); fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  expect(x.store.getState().doc.exercises[0]).toMatchObject({ elapsedMs: 4000, timerPaused: true });
  tick(30000); expect(x.elapsed()).toBe(4000);
  const restored = initialState(); restored.doc = validateSession(JSON.parse(serialize(x.store.getState()))).doc; cleanup();
  const y = mount(makeStore(restored)); tick(5000); expect(y.elapsed()).toBe(4000);
  fireEvent.click(screen.getByRole('button', { name: 'Resume' })); tick(1000); expect(y.elapsed()).toBe(5000);
 });
 it('migrates legacy elapsedMs without loss and continues from it', () => {
  const s = makeStore(initialState()); s.dispatch(actions.startFractionRound());
  const legacy = JSON.parse(serialize(s.getState())); legacy.doc.exercises[0].elapsedMs = 123456; delete legacy.doc.exercises[0].timerRunningSince;
  const restored = initialState(); restored.doc = validateSession(legacy).doc;
  const x = mount(makeStore(restored)); expect(x.elapsed()).toBe(123456); tick(1000); expect(x.elapsed()).toBe(124456);
 });
 it('switching questions closes the previous segment', () => {
  const x = mount(); tick(3000); const second = x.store.getState().doc.exercises[1].id;
  act(() => { x.store.dispatch(actions.timerStart({ exerciseId: second, now: Date.now() })); });
  expect(x.store.getState().doc.exercises[0]).toMatchObject({ elapsedMs: 3000 }); expect(x.store.getState().doc.exercises[0].timerRunningSince).toBeUndefined();
 });
 it('ignores clock going backwards', () => { const x = mount(); vi.setSystemTime(T0 - 5000); expect(x.elapsed()).toBe(0); });
 it('shows English time controls with an accessible elapsed output', () => {
  mount(); expect(screen.getByLabelText('Question elapsed time').textContent).toBe('00:00');
  expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  expect(document.querySelector('.question-timer')!.textContent).not.toMatch(/[\u0600-\u06ff]/);
 });
});
