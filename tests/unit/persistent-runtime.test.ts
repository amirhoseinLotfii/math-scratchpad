import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPersistentStore, SESSION_KEY } from '../../src/features/session/persistence/persistent-store';
import { actions, initialState } from '../../src/store';
import { serialize } from '../../src/persistence';
const runtimes: ReturnType<typeof createPersistentStore>[] = [];
function mount() { const runtime = createPersistentStore(); runtimes.push(runtime); return runtime; }
function envelope(revision = 1, writerId = 'saved-tab') {
 const state = initialState();
 return { version: 3, state: { session: { doc: state.doc, prefs: state.prefs, keyboardOpen: true }, sync: { revision, writerId } } };
}
function seed() { const saved = envelope(); localStorage.setItem(SESSION_KEY, JSON.stringify(saved)); return saved; }
function incoming(value: unknown) { window.dispatchEvent(new StorageEvent('storage', { key: SESSION_KEY, newValue: JSON.stringify(value) })); }
beforeEach(() => {
 vi.useFakeTimers(); localStorage.clear();
 vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
});
afterEach(() => { for (const runtime of runtimes.splice(0)) runtime.dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('production persistent runtime', () => {
 it('debounces fresh writes and stores only the portable session and revision metadata', () => {
  const runtime = mount(); expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  runtime.store.dispatch(actions.command({ type: 'digit', value: '7' }));
  vi.advanceTimersByTime(179); expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  vi.advanceTimersByTime(1); const saved = JSON.parse(localStorage.getItem(SESSION_KEY)!);
  expect(saved.version).toBe(3); expect(saved.state.session.doc).toEqual(runtime.store.getState().doc);
  expect(Object.keys(saved.state).sort()).toEqual(['session', 'sync']);
  expect(saved.state.session.past).toBeUndefined(); expect(saved.state.session.structureClipboard).toBeUndefined();
 });
 it('hydrates a validated draft without rewriting it on startup', () => {
  const saved = seed(); const raw = localStorage.getItem(SESSION_KEY); const runtime = mount();
  expect(runtime.store.getState().doc).toEqual(saved.state.session.doc);
  vi.advanceTimersByTime(1000); expect(localStorage.getItem(SESSION_KEY)).toBe(raw);
 });
 it.each(['{broken', JSON.stringify({ version: 99 }), JSON.stringify({ ...envelope(), state: { ...envelope().state, sync: { revision: -1, writerId: 'bad' } } })])('preserves an unreadable or unsupported stored draft: %s', raw => {
  localStorage.setItem(SESSION_KEY, raw); const runtime = mount();
  expect(runtime.store.getState().storageState?.kind).toBe('error');
  runtime.store.dispatch(actions.command({ type: 'digit', value: '5' }));
  vi.advanceTimersByTime(1000); runtime.flush(); expect(localStorage.getItem(SESSION_KEY)).toBe(raw);
 });
 it('migrates legacy data without removing the original backup', () => {
  const original = serialize(initialState()); localStorage.setItem('math-scratchpad-redux-v2', original);
  mount(); vi.advanceTimersByTime(180);
  expect(JSON.parse(localStorage.getItem(SESSION_KEY)!).version).toBe(3);
  expect(localStorage.getItem('math-scratchpad-redux-v2')).toBe(original);
 });
 it('applies newer remote work in a clean tab and ignores stale and malformed events', () => {
  const saved = seed(); const runtime = mount(); const remote = structuredClone(saved);
  remote.state.sync.revision = 2; remote.state.sync.writerId = 'other'; remote.state.session.doc.exercises[0].prompt = 'Remote question';
  incoming(remote); expect(runtime.store.getState().doc.exercises[0].prompt).toBe('Remote question');
  incoming(saved); incoming({ version: 3, state: null });
  expect(runtime.store.getState().doc.exercises[0].prompt).toBe('Remote question');
 });
 it.each(['local', 'remote'] as const)('keeps unsaved work until the explicit %s conflict decision', choice => {
  const saved = seed(); const runtime = mount(); runtime.store.dispatch(actions.command({ type: 'digit', value: '7' }));
  const local = structuredClone(runtime.store.getState().doc); const remote = structuredClone(saved);
  remote.state.sync.revision = 2; remote.state.sync.writerId = 'other'; remote.state.session.doc.exercises[0].prompt = 'Remote question';
  incoming(remote); expect(runtime.store.getState().storageState?.kind).toBe('conflict');
  expect(runtime.store.getState().doc).toEqual(local); runtime.store.resolveConflict!(choice);
  expect(runtime.store.getState().storageState).toBeUndefined();
  expect(runtime.store.getState().doc).toEqual(choice === 'local' ? local : remote.state.session.doc);
 });
 it('flushes work and removes storage listeners when disposed', () => {
  const saved = seed(); const runtime = mount(); runtime.store.dispatch(actions.command({ type: 'digit', value: '4' }));
  runtime.dispose(); expect(JSON.parse(localStorage.getItem(SESSION_KEY)!).state.sync.revision).toBe(2);
  const before = structuredClone(runtime.store.getState().doc); saved.state.sync.revision = 100;
  incoming(saved); expect(runtime.store.getState().doc).toEqual(before);
 });
});
