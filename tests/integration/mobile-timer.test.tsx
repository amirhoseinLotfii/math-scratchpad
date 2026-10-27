import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from '../../src/app/store-provider';
import { QuestionTimer } from '../../src/QuestionTimer';
import { actions, initialState, makeStore } from '../../src/store';
let now = 0;
beforeEach(() => { now = 0; vi.useFakeTimers(); vi.spyOn(performance, 'now').mockImplementation(() => now); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
function mount(suspended = false) {
 const store = makeStore(initialState()); store.dispatch(actions.startFractionRound());
 const id = store.getState().doc.exerciseId;
 const component = (paused = suspended) => <Provider store={store}><QuestionTimer exerciseId={id} suspended={paused} /></Provider>;
 const view = render(component());
 return { store, id, view, component, elapsed: () => store.getState().doc.exercises[0].elapsedMs ?? 0 };
}
function tick(milliseconds: number) { now += milliseconds; act(() => vi.advanceTimersByTime(milliseconds)); }
describe('Mobile timer lifecycle', () => {
 it('does not count time while a modal suspends editing', () => { const x = mount(true); tick(5000); expect(x.elapsed()).toBe(0); });
 it('resumes after suspension without adding the suspended interval', () => {
  const x = mount(true); tick(5000); x.view.rerender(x.component(false)); tick(1000); expect(x.elapsed()).toBe(1000);
 });
 it('flushes a partial second on unmount exactly once', () => {
  const x = mount(); now = 350; x.view.unmount(); expect(x.elapsed()).toBe(350);
  now = 4000; act(() => vi.advanceTimersByTime(4000)); expect(x.elapsed()).toBe(350);
 });
 it('does not double-count repeated focus events', () => {
  const x = mount(); fireEvent.focus(window); fireEvent.focus(window); tick(1000); expect(x.elapsed()).toBe(1000);
 });
 it('pauses on pagehide and flushes only the active portion', () => {
  const x = mount(); now = 250; fireEvent(window, new Event('pagehide')); tick(5000); expect(x.elapsed()).toBe(250);
 });
 it('ignores hidden-page time then resumes on visibility restoration', () => {
  let hidden = false; vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  const x = mount(); now = 250; hidden = true; fireEvent(document, new Event('visibilitychange'));
  tick(5000); expect(x.elapsed()).toBe(250);
  hidden = false; fireEvent(document, new Event('visibilitychange')); tick(1000); expect(x.elapsed()).toBe(1250);
 });
 it('manual pause remains paused after window blur and focus', () => {
  const x = mount(); fireEvent.click(screen.getByRole('button')); fireEvent.blur(window); fireEvent.focus(window);
  tick(5000); expect(x.elapsed()).toBe(0);
 });
 it('shows English time controls with an accessible elapsed output', () => {
  mount(); expect(screen.getByLabelText('Question elapsed time').textContent).toBe('00:00');
  expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  expect(document.querySelector('.question-timer')!.textContent).not.toMatch(/[\u0600-\u06ff]/);
 });
});
