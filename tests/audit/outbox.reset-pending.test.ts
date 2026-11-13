import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { initializeLearningStorage, resetLearningDbForTests, queueLearnEvent } from '../../src/sync/browser-db';
import { emitLearnEvent, resetLearnEventRuntimeForTests } from '../../src/sync/events';
import { BrowserSyncRuntime } from '../../src/sync/runtime';

afterEach(async () => { resetLearnEventRuntimeForTests(); await resetLearningDbForTests(); vi.unstubAllGlobals(); localStorage.clear(); });
it('outbox.does-not-transmit-while-local-reset-is-pending', async () => {
  vi.stubGlobal('crypto', webcrypto as unknown as Crypto);
  await initializeLearningStorage();
  await queueLearnEvent({id:crypto.randomUUID(),schema:1,ts:new Date().toISOString(),deviceId:crypto.randomUUID(),bankVersion:'synthetic',session:'synthetic',chapter:1,lesson:'1.1',section:'1.1',concept:'test',type:'lesson_open'});
  localStorage.setItem('math-scratchpad-local-learning-reset-pending-v1','1');
  const posted: unknown[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (path === '/events') {
      const body = JSON.parse(String(init?.body)); posted.push(body);
      return Response.json({ events: body.events.map((e: {id:string}, i: number) => ({id:e.id,seq:i+1})), cursor: body.events.length });
    }
    return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
  });
  const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher });
  try {
    await runtime.start(); runtime.setIdToken('synthetic-id');
    await runtime.syncNow();
    expect(posted).toHaveLength(0);
  } finally { runtime.stop(); }
});
