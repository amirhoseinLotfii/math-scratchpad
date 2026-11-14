import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LearnEvent } from '../../src/sync/events';
import {
  LEARNING_CACHE_STORE,
  LEARNING_META_STORE,
  LEARNING_OUTBOX_STORE,
  LEARNING_QUARANTINE_STORE,
  LEARNING_SERVER_EVENTS_STORE,
  completeLocalLearningReset,
  getLearningDb,
  reconcileServerLearningResetEpoch,
  initializeLearningStorage,
  isLocalLearningResetPending,
  prepareLocalLearningReset,
  queueLearnEvent,
  readOutboxCount,
  resetLearningDbForTests,
  setSyncMeta,
  storeServerEvents,
} from '../../src/sync/browser-db';
import { markLocalLearningResetPending } from '../../src/sync/learning-reset-epoch';

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
  it('quarantines old-generation events and preserves local answers across distinct server generations', async () => {
    await initializeLearningStorage();
    const db = await getLearningDb();
    await db.put(LEARNING_CACHE_STORE, {
      key: 'math-scratchpad-session-v3', value: '{"answer":"before reset"}', updatedAt: new Date().toISOString(),
    });
    await queueLearnEvent(oldAnswer);

    expect(await reconcileServerLearningResetEpoch('2026-11-12-v3')).toBe(false);
    expect(await readOutboxCount()).toBe(1);

    expect(await reconcileServerLearningResetEpoch('server-generation-one')).toBe(true);
    expect(isLocalLearningResetPending()).toBe(false);
    expect(await readOutboxCount()).toBe(0);
    expect(await db.get(LEARNING_CACHE_STORE, 'math-scratchpad-session-v3')).toMatchObject({ value: '{"answer":"before reset"}' });
    expect(await db.getAll(LEARNING_QUARANTINE_STORE)).toMatchObject([{ id: oldAnswer.id, event: oldAnswer, creationEpoch: '2026-11-12-v3' }]);

    await queueLearnEvent({ ...oldAnswer, id: 'reset-test-event-two' });
    expect(await reconcileServerLearningResetEpoch('server-generation-one')).toBe(false);
    expect(await readOutboxCount()).toBe(1);
    expect(await reconcileServerLearningResetEpoch('server-generation-two')).toBe(true);
    expect(await readOutboxCount()).toBe(0);
    expect(await db.getAll(LEARNING_QUARANTINE_STORE)).toHaveLength(2);
    expect(await db.get(LEARNING_CACHE_STORE, 'math-scratchpad-session-v3')).toMatchObject({ value: '{"answer":"before reset"}' });
  });

  it('keeps data created while cloud cleanup is pending and preserves login, device, Drive, and bank data', async () => {
    await prepareLocalLearningReset();
    await initializeLearningStorage();
    const db = await getLearningDb();
    markLocalLearningResetPending();

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
    expect(await readOutboxCount()).toBe(1);
    await storeServerEvents([{ seq: 42, event: oldAnswer }]);
    await setSyncMeta('server-cursor', 42);
    expect(await readOutboxCount()).toBe(1);

    await completeLocalLearningReset('server-generation-one');

    expect(isLocalLearningResetPending()).toBe(false);
    expect(localStorage.getItem('math-scratchpad-device-id-v1')).toBe('keep-device');
    expect(localStorage.getItem('math-scratchpad-drive-config-v1')).toBe('{"fileId":"keep-bank"}');
    expect(localStorage.getItem('math-scratchpad-google-id-session-v1')).toBe('keep-login');
    expect(localStorage.getItem('math-scratchpad-drive-bank-cache-v1:keep-bank')).toBe('{"bank":true}');
    expect(localStorage.getItem('math-scratchpad-session-v3')).toBe('{"answer":"new while waiting"}');
    expect(sessionStorage.getItem('math-scratchpad-reading-position-v1')).toBe('{"section":"new while waiting"}');
    expect(await db.get(LEARNING_CACHE_STORE, 'math-scratchpad-session-v3')).toMatchObject({ value: '{"answer":"new while waiting"}' });
    expect(await db.get(LEARNING_CACHE_STORE, 'math-scratchpad-drive-bank-cache-v1:keep-bank')).toMatchObject({ value: '{"bank":true}' });
    expect(await db.count(LEARNING_OUTBOX_STORE)).toBe(1);
    expect((await db.getAll(LEARNING_OUTBOX_STORE))[0]?.creationEpoch).toBe('server-generation-one');
    expect(await db.count(LEARNING_SERVER_EVENTS_STORE)).toBe(1);
    expect(await db.get(LEARNING_META_STORE, 'server-cursor')).toMatchObject({ value: 42 });
  });

  it('upgrade.no-local-wipe retains existing browser learning data', async () => {
    await initializeLearningStorage();
    const db = await getLearningDb();
    await db.put(LEARNING_CACHE_STORE, {
      key: 'math-scratchpad-session-v3', value: '{"chapter":1,"answer":"keep"}', updatedAt: new Date().toISOString(),
    });
    await queueLearnEvent({ ...oldAnswer, id: 'upgrade-preserved-event' });

    await prepareLocalLearningReset();

    expect(isLocalLearningResetPending()).toBe(false);
    expect(await db.get(LEARNING_CACHE_STORE, 'math-scratchpad-session-v3')).toMatchObject({ value: '{"chapter":1,"answer":"keep"}' });
    expect(await readOutboxCount()).toBe(1);
  });
});
