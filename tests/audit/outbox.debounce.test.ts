import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { initializeLearningStorage, resetLearningDbForTests } from '../../src/sync/browser-db';
import { emitLearnEvent, resetLearnEventRuntimeForTests } from '../../src/sync/events';
import { BrowserSyncRuntime } from '../../src/sync/runtime';
import { LEARNING_RESET_EPOCH } from '../../src/sync/learning-reset-epoch';

afterEach(async () => {
  resetLearnEventRuntimeForTests();
  await resetLearningDbForTests();
  vi.unstubAllGlobals();
  localStorage.clear();
});
it('outbox.waits-for-3400-ms-after-first-event', async () => {
  vi.stubGlobal('crypto', webcrypto as unknown as Crypto);
  await initializeLearningStorage();
  let firstPostTime: number | undefined;
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (path === '/reset/status') return Response.json({ status: 'idle', epoch: LEARNING_RESET_EPOCH });
    if (path === '/reset/epoch') return Response.json({ epoch: LEARNING_RESET_EPOCH });
    if (path === '/events') {
      firstPostTime = now;
      const body = JSON.parse(String(init?.body));
      return Response.json({
        events: body.events.map((e: { id: string }, i: number) => ({ id: e.id, seq: i + 1 })),
        cursor: body.events.length,
      });
    }
    return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
  });
  const dueTimers = new Map<number, { due: number; callback: () => void }>();
  let nextTimer = 0;
  let now = 0;
  const runtime = new BrowserSyncRuntime({
    apiOrigin: 'https://sync.example',
    fetcher,
    scheduleTimeout: ((callback: () => void, delay: number) => {
      const id = ++nextTimer;
      dueTimers.set(id, { due: now + delay, callback });
      return id as unknown as ReturnType<typeof setTimeout>;
    }) as typeof globalThis.setTimeout,
    cancelTimeout: (timer) => {
      dueTimers.delete(timer as unknown as number);
    },
  });
  function advance(ms: number) {
    now += ms;
    for (const [id, timer] of dueTimers) {
      if (timer.due > now) continue;
      dueTimers.delete(id);
      timer.callback();
    }
  }
  try {
    await runtime.start();
    runtime.setIdToken('synthetic-id');
    await vi.waitFor(() => expect(runtime.getSnapshot().phase).toBe('synced'));
    const start = now;
    emitLearnEvent(
      { bankVersion: 'synthetic', session: 'synthetic', chapter: 1, lesson: '1.1', section: '1.1', concept: 'test' },
      { type: 'lesson_open' },
    );
    await vi.waitFor(() => expect([...dueTimers.values()].some((timer) => timer.due === 3400)).toBe(true));
    advance(3399);
    expect(firstPostTime).toBeUndefined();
    advance(1);
    await vi.waitFor(() => expect(firstPostTime).toBeDefined());
    expect(firstPostTime! - start).toBeGreaterThanOrEqual(3400);
  } finally {
    runtime.stop();
  }
});
