import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, initialState } from '../../../src/store';
import { createPersistentStore, SESSION_KEY } from '../../../src/features/session/persistence/persistent-store';
import {
  flushLearningStorage,
  getLearningDb,
  getLearningStorage,
  initializeLearningStorage,
  resetLearningDbForTests,
} from '../../../src/sync/browser-db';
import type { ServerStorageChangeSource } from '../../../src/sync/server-storage';

const seededState = initialState();
const testSession = { doc: seededState.doc, prefs: seededState.prefs, keyboardOpen: false };
const seed = JSON.stringify({ version: 3, state: { session: testSession, sync: { revision: 1, writerId: 'seed' } } });
let runtime: ReturnType<typeof createPersistentStore>;

function edit(digit: string) {
  runtime.store.dispatch(actions.command({ type: 'digit', value: digit }));
}

function deliver(source?: ServerStorageChangeSource, remove = false) {
  const event = new StorageEvent('storage', {
    key: SESSION_KEY,
    newValue: remove
      ? null
      : JSON.stringify({
          version: 3,
          state: { session: testSession, sync: { revision: 2, writerId: 'other-tab' } },
        }),
  });
  Object.defineProperty(event, 'source', { value: source });
  window.dispatchEvent(event);
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(SESSION_KEY, seed);
  await initializeLearningStorage();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  runtime = createPersistentStore();
});

afterEach(async () => {
  await runtime.flush();
  runtime.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  await resetLearningDbForTests();
});

describe('IndexedDB autosave', () => {
  it.each([
    { path: 'remote merge', complete: () => deliver('server-merge') },
    { path: 'remote removal', complete: () => deliver('server-resolution-remote', true) },
    { path: 'local server resolution', complete: () => deliver('server-resolution-local') },
    {
      path: 'local tab conflict resolution',
      complete: () => {
        deliver();
        runtime.store.resolveConflict?.('local');
      },
    },
  ])('saves the next edit after $path on the 800 ms cadence', async ({ complete }) => {
    const db = await getLearningDb();
    const writes = vi.spyOn(getLearningStorage(), 'setItem');
    edit('2');
    complete();
    await flushLearningStorage();
    writes.mockClear();
    edit('7');
    await vi.advanceTimersByTimeAsync(799);
    expect(writes).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(writes).toHaveBeenCalledTimes(1);
    await flushLearningStorage();
    const persisted = await db.get('cache', SESSION_KEY);
    expect(JSON.parse(persisted!.value).state.session.doc).toEqual(runtime.store.getState().doc);
  });

  it('keeps saving on the first-edit cadence during continuous typing', async () => {
    const writes = vi.spyOn(getLearningStorage(), 'setItem');
    edit('1');
    await vi.advanceTimersByTimeAsync(799);
    edit('2');
    expect(writes).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(writes).toHaveBeenCalledTimes(1);
    edit('3');
    await vi.advanceTimersByTimeAsync(799);
    expect(writes).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(writes).toHaveBeenCalledTimes(2);
  });

  it('does not recreate a cleared draft', async () => {
    const db = await getLearningDb();
    const writes = vi.spyOn(getLearningStorage(), 'setItem');
    edit('2');
    runtime.store.clearStorage?.();
    edit('7');
    await vi.advanceTimersByTimeAsync(800);
    expect(writes).not.toHaveBeenCalled();
    expect(await db.get('cache', SESSION_KEY)).toBeUndefined();
  });
});
