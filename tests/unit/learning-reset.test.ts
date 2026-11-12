import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LearnEvent } from '../../src/sync/events';
import {
  LEARNING_CACHE_STORE,
  LEARNING_META_STORE,
  LEARNING_OUTBOX_STORE,
  LEARNING_SERVER_EVENTS_STORE,
  completeLocalLearningReset,
  getLearningDb,
  initializeLearningStorage,
  isLocalLearningResetPending,
  prepareLocalLearningReset,
  queueLearnEvent,
  resetLearningDbForTests,
  setSyncMeta,
  storeServerEvents,
} from '../../src/sync/browser-db';

const oldAnswer: LearnEvent = {
  id: 'reset-test-event', schema: 1, ts: '2026-11-12T12:00:00.000Z', deviceId: 'reset-test-device',
  bankVersion: 'reset-test-bank', session: 'reset-test-session', chapter: 1,
  lesson: '1.1', section: '1.1', concept: 'reset-test-concept', type: 'lesson_open',
};

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await resetLearningDbForTests();
});

afterEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await resetLearningDbForTests();
});

describe('coordinated local learning reset', () => {
  it('clears data created while cloud cleanup was pending and preserves login, device, Drive, and bank data', async () => {
    await prepareLocalLearningReset();
    await initializeLearningStorage();
    const db = await getLearningDb();

    localStorage.setItem('math-scratchpad-device-id-v1', 'keep-device');
    localStorage.setItem('math-scratchpad-drive-config-v1', '{"fileId":"keep-bank"}');
    localStorage.setItem('math-scratchpad-google-id-session-v1', 'keep-login');
    localStorage.setItem('math-scratchpad-drive-bank-cache-v1:keep-bank', '{"bank":true}');
    localStorage.setItem('math-scratchpad-session-v3', '{"answer":"new while waiting"}');
    sessionStorage.setItem('math-scratchpad-reading-position-v1', '{"section":"new while waiting"}');

    await db.put(LEARNING_CACHE_STORE, {
      key: 'math-scratchpad-session-v3', value: '{"answer":"new while waiting"}', updatedAt: new Date().toISOString(),
    });
    await db.put(LEARNING_CACHE_STORE, {
      key: 'math-scratchpad-drive-bank-cache-v1:keep-bank', value: '{"bank":true}', updatedAt: new Date().toISOString(),
    });
    await queueLearnEvent(oldAnswer);
    await storeServerEvents([{ seq: 42, event: oldAnswer }]);
    await setSyncMeta('server-cursor', 42);

    await completeLocalLearningReset();

    expect(isLocalLearningResetPending()).toBe(false);
    expect(localStorage.getItem('math-scratchpad-device-id-v1')).toBe('keep-device');
    expect(localStorage.getItem('math-scratchpad-drive-config-v1')).toBe('{"fileId":"keep-bank"}');
    expect(localStorage.getItem('math-scratchpad-google-id-session-v1')).toBe('keep-login');
    expect(localStorage.getItem('math-scratchpad-drive-bank-cache-v1:keep-bank')).toBe('{"bank":true}');
    expect(localStorage.getItem('math-scratchpad-session-v3')).toBeNull();
    expect(sessionStorage.getItem('math-scratchpad-reading-position-v1')).toBeNull();
    expect(await db.getAll(LEARNING_CACHE_STORE)).toMatchObject([
      { key: 'math-scratchpad-drive-bank-cache-v1:keep-bank', value: '{"bank":true}' },
    ]);
    expect(await db.count(LEARNING_OUTBOX_STORE)).toBe(0);
    expect(await db.count(LEARNING_SERVER_EVENTS_STORE)).toBe(0);
    expect(await db.get(LEARNING_META_STORE, 'server-cursor')).toBeUndefined();
  });
});
