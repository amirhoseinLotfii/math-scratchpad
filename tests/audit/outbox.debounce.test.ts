import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { initializeLearningStorage, resetLearningDbForTests } from '../../src/sync/browser-db';
import { emitLearnEvent, resetLearnEventRuntimeForTests } from '../../src/sync/events';
import { BrowserSyncRuntime } from '../../src/sync/runtime';

afterEach(async () => { resetLearnEventRuntimeForTests(); await resetLearningDbForTests(); vi.unstubAllGlobals(); localStorage.clear(); });
it('outbox.does-not-send-within-five-seconds.after-first-event', async () => {
  vi.stubGlobal('crypto', webcrypto as unknown as Crypto);
  await initializeLearningStorage();
  let firstPostTime: number | undefined;
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (path === '/events') {
      firstPostTime = performance.now();
      const body = JSON.parse(String(init?.body));
      return Response.json({ events: body.events.map((e: {id:string}, i: number) => ({id:e.id,seq:i+1})), cursor: body.events.length });
    }
    return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
  });
  const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher });
  try {
    await runtime.start(); runtime.setIdToken('synthetic-id');
    await vi.waitFor(() => expect(runtime.getSnapshot().phase).toBe('synced'));
    const start = performance.now();
    emitLearnEvent({bankVersion:'synthetic',session:'synthetic',chapter:1,lesson:'1.1',section:'1.1',concept:'test'}, {type:'lesson_open'});
    await vi.waitFor(() => expect(firstPostTime).toBeDefined(), { timeout: 7000, interval: 20 });
    expect(firstPostTime! - start).toBeGreaterThanOrEqual(5000);
  } finally { runtime.stop(); }
});
