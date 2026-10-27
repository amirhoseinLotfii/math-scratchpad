import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, initialState, makeStore } from '../../src/store';
import { restoreState, saveState, serialize } from '../../src/persistence';
const key = 'math-scratchpad-redux-v2';
beforeEach(() => localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('UX-STORAGE: durable work and recovery failures', () => {
 it('starts from a usable draft when storage is empty', () => { expect(restoreState().doc.exercises).toHaveLength(1); });
 it('recovers all session data and keyboard preference after save/reload', () => {
  const s = makeStore(initialState()); s.dispatch(actions.startFractionRound()); s.dispatch(actions.keyboard(true));
  s.dispatch(actions.command({ type: 'digit', value: '7' })); s.dispatch(actions.command({ type: 'newStep' })); s.dispatch(actions.setConfidence('high'));
  expect(saveState(s.getState())).toBe(true); const restored = restoreState();
  expect(restored.doc.exercises).toEqual(s.getState().doc.exercises); expect(restored.keyboardOpen).toBe(true);
 });
 it('recovers legacy v1 without mutating its original backup', () => {
  const s = initialState(), legacy = JSON.stringify({ version: 1, state: { exercises: s.doc.exercises, exercise: s.doc.exerciseId, step: s.doc.cursor.stepId, node: s.doc.cursor.nodeId, caret: 0 } });
  localStorage.setItem('math-scratchpad-flow-v1', legacy);
  expect(restoreState().doc.exercises).toEqual(s.doc.exercises);
  expect(localStorage.getItem('math-scratchpad-flow-v1')).toBe(legacy);
 });
 it.each(['{', 'null', '{"version":999}', '{"version":2,"doc":{"exercises":[]}}'])('preserves corrupt raw data and offers recovery for %s', raw => {
  localStorage.setItem(key, raw); const restored = restoreState();
  expect(restored.doc.exercises.length).toBeGreaterThan(0); expect(restored.notice).toMatch(/restor|backup/i);
  expect(localStorage.getItem(key)).toBe(raw);
 });
 it('does not silently replace an unsupported future-version draft on hydration', () => {
  const raw = JSON.stringify({ version: 999, doc: { note: 'future work' } }); localStorage.setItem(key, raw);
  restoreState(); expect(localStorage.getItem(key)).toBe(raw);
 });
 it('storage read denial yields a usable in-memory draft and a recovery notice', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
  const restored = restoreState(); expect(restored.doc.exercises).toHaveLength(1); expect(restored.notice).not.toBe('');
 });
 it.each(['QuotaExceededError', 'SecurityError'])('write %s leaves in-memory math intact and reports failure', name => {
  const s = makeStore(initialState()); s.dispatch(actions.command({ type: 'digit', value: '8' })); const before = serialize(s.getState());
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Unavailable', name); });
  expect(saveState(s.getState())).toBe(false); expect(serialize(s.getState())).toBe(before);
 });
 it('persists student work rather than transient modal/menu state', () => {
  const s = makeStore(initialState()); s.dispatch(actions.symbols()); saveState(s.getState());
  const payload = JSON.parse(localStorage.getItem(key)!);
  expect(payload.symbolsOpen).toBeUndefined(); expect(payload.structureClipboard).toBeUndefined();
  expect(payload.past).toBeUndefined(); expect(payload.future).toBeUndefined();
 });
});
