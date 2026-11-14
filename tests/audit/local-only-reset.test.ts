import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { emitLearnEvent, resetLearnEventRuntimeForTests } from '../../src/sync/events';
import {
  LEARNING_CACHE_STORE,
  LEARNING_OUTBOX_STORE,
  completeLocalLearningReset,
  getLearningDb,
  initializeLearningStorage,
  isLocalLearningResetPending,
  prepareLocalLearningReset,
  queueLearnEvent,
  readOutboxBatch,
  readOutboxCount,
  resetLearningDbForTests,
  reconcileServerLearningResetEpoch,
} from '../../src/sync/browser-db';
import { BrowserSyncRuntime } from '../../src/sync/runtime';
import { LEARNING_RESET_EPOCH, LOCAL_PENDING_EPOCH_PREFIX, LOCAL_RESET_PENDING_KEY, markServerResetStatusVerified } from '../../src/sync/learning-reset-epoch';
import type { LearnEvent } from '../../src/sync/events';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, writable: true, configurable: true });

const SESSION_KEY = 'math-scratchpad-session-v3';
const originalEvent: LearnEvent = {
  id: '10000000-0000-4000-8000-000000000001', schema: 1, ts: '2026-11-13T00:00:00.000Z',
  deviceId: '20000000-0000-4000-8000-000000000001', bankVersion: 'synthetic-v1', session: 'local-reset',
  chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations', type: 'lesson_open',
};

beforeEach(async () => {
  markServerResetStatusVerified();
  localStorage.clear();
  sessionStorage.clear();
  await resetLearningDbForTests();
  resetLearnEventRuntimeForTests();
});

afterEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await resetLearningDbForTests();
  resetLearnEventRuntimeForTests();
  vi.unstubAllGlobals();
  markServerResetStatusVerified();
});

it('local-only.startup-keeps-the-editor-event-in-the-outbox-with-its-creation-epoch', async () => {
  await initializeLearningStorage();
  const fetcher = vi.fn(async (_input: RequestInfo | URL) => Response.json({ status: 'awaiting_release', epoch: 'server-generation-next' }));
  const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher });
  try {
    localStorage.setItem(LOCAL_RESET_PENDING_KEY, '1');
    await runtime.start();
    await runtime.refreshResetStatus();
    emitLearnEvent({ bankVersion: 'synthetic-v1', session: 'local-only', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' }, { type: 'lesson_open' });
    await vi.waitFor(async () => expect(await readOutboxCount()).toBe(1));

    const [record] = await readOutboxBatch();
    expect(record?.creationEpoch).toBe('server-generation-next');
    expect(fetcher.mock.calls.some(([input]) => String(input).endsWith('/events'))).toBe(false);
  } finally {
    runtime.stop();
  }
});

it('local-only.never-sends-an-authenticated-write-before-first-status-response', async () => {
  await initializeLearningStorage();
  let releaseStatus!: (response: Response) => void;
  const statusResponse = new Promise<Response>(resolve => { releaseStatus = resolve; });
  const writes: string[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = new URL(String(input)).pathname;
    if (path === '/reset/status') return statusResponse;
    if (path === '/reset/epoch') return Response.json({ epoch: LEARNING_RESET_EPOCH });
    if (path === '/events' && init.method === 'POST') {
      writes.push(path);
      const body = JSON.parse(String(init.body)) as { events: Array<{ id: string }> };
      return Response.json({ events: body.events.map((event, index) => ({ id: event.id, seq: index + 1 })) });
    }
    if (path === '/snapshot' || path === '/sync') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
    return Response.json({});
  });
  const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher });
  try {
    const starting = runtime.start();
    runtime.setIdToken('synthetic-owner-token');
    emitLearnEvent({ bankVersion: 'synthetic-v1', session: 'status-unverified', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' }, { type: 'lesson_open' });
    await vi.waitFor(async () => expect(await readOutboxCount()).toBe(1));

    expect(writes).toEqual([]);
    expect(fetcher.mock.calls.some(([input]) => String(input).endsWith('/events'))).toBe(false);
    releaseStatus(Response.json({ status: 'idle', epoch: LEARNING_RESET_EPOCH }));
    await starting;
    await vi.waitFor(() => expect(writes).toEqual(['/events']));
    expect(isLocalLearningResetPending()).toBe(false);
  } finally {
    runtime.stop();
  }
});

it('local-only.status-network-failure-keeps-editing-local-without-fabricating-a-reset', async () => {
  await initializeLearningStorage();
  const runtime = new BrowserSyncRuntime({
    apiOrigin: 'https://sync.example',
    fetcher: vi.fn(async () => { throw new Error('offline'); }),
  });
  try {
    await runtime.start();
    runtime.setIdToken('synthetic-owner-token');
    emitLearnEvent({ bankVersion: 'synthetic-v1', session: 'status-offline', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' }, { type: 'lesson_open' });
    await vi.waitFor(async () => expect(await readOutboxCount()).toBe(1));
    const [record] = await readOutboxBatch();

    expect(isLocalLearningResetPending()).toBe(false);
    expect(record?.creationEpoch).toMatch(new RegExp(`^${LOCAL_PENDING_EPOCH_PREFIX}`));
  } finally {
    runtime.stop();
  }
});

it('local-reset.prepare-preserves-existing-learning-cache-and-outbox', async () => {
  await initializeLearningStorage();
  const db = await getLearningDb();
  await db.put(LEARNING_CACHE_STORE, { key: SESSION_KEY, value: '{"answer":"keep me"}', updatedAt: new Date().toISOString() });
  await queueLearnEvent(originalEvent);

  await expect(prepareLocalLearningReset()).resolves.toBe(false);

  expect(isLocalLearningResetPending()).toBe(false);
  expect(await db.get(LEARNING_CACHE_STORE, SESSION_KEY)).toMatchObject({ value: '{"answer":"keep me"}' });
  expect(await readOutboxCount()).toBe(1);
});

it('local-reset.epoch-change-quarantines-stale-events-without-clearing-local-answers', async () => {
  await initializeLearningStorage();
  const db = await getLearningDb();
  await db.put(LEARNING_CACHE_STORE, { key: SESSION_KEY, value: '{"answer":"keep me"}', updatedAt: new Date().toISOString() });
  await queueLearnEvent(originalEvent);

  await expect(reconcileServerLearningResetEpoch('server-generation-next')).resolves.toBe(true);

  expect(isLocalLearningResetPending()).toBe(false);
  expect(await db.get(LEARNING_CACHE_STORE, SESSION_KEY)).toMatchObject({ value: '{"answer":"keep me"}' });
  expect(db.objectStoreNames.contains('quarantine')).toBe(true);
  const rawDb = db as unknown as { getAll: (storeName: string) => Promise<Array<{ id: string; event: LearnEvent; creationEpoch: string }>> };
  const quarantine = await rawDb.getAll('quarantine');
  expect(quarantine).toMatchObject([{ id: originalEvent.id, event: originalEvent, creationEpoch: LEARNING_RESET_EPOCH }]);
  expect(await readOutboxCount()).toBe(0);
});

it('local-reset.release-keeps-new-local-answer-and-outbox', async () => {
  await initializeLearningStorage();
  const db = await getLearningDb();
  localStorage.setItem(LOCAL_RESET_PENDING_KEY, '1');
  await db.put(LEARNING_CACHE_STORE, { key: SESSION_KEY, value: '{"answer":"new work"}', updatedAt: new Date().toISOString() });
  await db.put(LEARNING_OUTBOX_STORE, { id: originalEvent.id, event: originalEvent, queuedAt: originalEvent.ts, creationEpoch: LEARNING_RESET_EPOCH });

  await completeLocalLearningReset('server-generation-next');

  expect(isLocalLearningResetPending()).toBe(false);
  expect(await db.get(LEARNING_CACHE_STORE, SESSION_KEY)).toMatchObject({ value: '{"answer":"new work"}' });
  expect(await readOutboxCount()).toBe(0);
  expect(db.objectStoreNames.contains('quarantine')).toBe(true);
  const quarantined = await (db as unknown as { getAll: (storeName: string) => Promise<Array<{ id: string; event: LearnEvent }>> }).getAll('quarantine');
  expect(quarantined).toMatchObject([{ id: originalEvent.id, event: originalEvent }]);
});
