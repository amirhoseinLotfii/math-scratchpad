import { describe, expect, it } from 'vitest';
import { getLearningDb, getLearningStorage, initializeLearningStorage, flushLearningStorage } from '../../../src/sync/browser-db';
import { SESSION_KEY, LESSON_KEY, OLD_SESSION, OLD_LESSON, seedLegacy } from '../../helpers/browser-sync';
describe('IndexedDB learning cache and legacy migration', () => {
  it('copies learning records and safe caches into IndexedDB, retaining legacy progress until verification', async () => {
    seedLegacy();
    const bootstrap = await initializeLearningStorage();
    expect(bootstrap.dbAvailable).toBe(true);
    expect(bootstrap.migration?.entries.map((entry) => entry.key).sort()).toEqual([LESSON_KEY, SESSION_KEY]);
    expect(bootstrap.storage.getItem(SESSION_KEY)).toBe(OLD_SESSION);
    expect(bootstrap.storage.getItem(LESSON_KEY)).toBe(OLD_LESSON);
    expect(localStorage.getItem(SESSION_KEY)).toBe(OLD_SESSION);
    expect(localStorage.getItem(LESSON_KEY)).toBe(OLD_LESSON);
    expect(localStorage.getItem('math-scratchpad-ui-v1:questions')).toBe('0');
    expect(localStorage.getItem('math-scratchpad-drive-bank-cache-v1:bank')).toBeNull();
    expect(bootstrap.storage.getItem('math-scratchpad-drive-bank-cache-v1:bank')).toBe('{"cached":true}');
    const db = await getLearningDb();
    expect((await db.get('cache', SESSION_KEY))?.value).toBe(OLD_SESSION);
  });

  it('keeps legacy values readable and blocks writes when IndexedDB bootstrap fails mid-copy', async () => {
    seedLegacy();
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === 'cache') throw new DOMException('Quota full', 'QuotaExceededError');
      return originalPut.call(this, value, key);
    };
    let bootstrap: Awaited<ReturnType<typeof initializeLearningStorage>> | undefined;
    try {
      bootstrap = await initializeLearningStorage();
    } finally {
      IDBObjectStore.prototype.put = originalPut;
    }

    expect(bootstrap?.dbAvailable).toBe(false);
    expect(bootstrap?.storage.getItem(SESSION_KEY)).toBe(OLD_SESSION);
    expect(localStorage.getItem(SESSION_KEY)).toBe(OLD_SESSION);
    expect(() => getLearningStorage().setItem(SESSION_KEY, 'new draft')).toThrow(/IndexedDB is not available/);
    expect(localStorage.getItem(SESSION_KEY)).toBe(OLD_SESSION);
  });

  it('writes new session data to IDB without putting learning data back into localStorage', async () => {
    await initializeLearningStorage();
    const storage = getLearningStorage();
    storage.setItem(SESSION_KEY, '{"new":"work"}');
    await flushLearningStorage();
    const db = await getLearningDb();
    await db.get('cache', SESSION_KEY);
    expect((await db.get('cache', SESSION_KEY))?.value).toBe('{"new":"work"}');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });
});
