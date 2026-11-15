import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { emitLearnEvent, type LearnEvent } from '../../../src/sync/events';
import {
  getLearningDb,
  initializeLearningStorage,
  queueLearnEvent,
  readOutboxCount,
  resetLearningDbForTests,
} from '../../../src/sync/browser-db';
import { BrowserSyncRuntime } from '../../../src/sync/runtime';
import { LEARNING_RESET_EPOCH } from '../../../src/sync/learning-reset-epoch';
import { withIdleResetStatus, fixtureEvent } from '../../helpers/browser-sync';
describe('outbox', () => {
  it('is commutative under event order and idempotent under duplicate delivery', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.integer({ min: 0, max: 25 }), { maxLength: 30 }), async (input) => {
        const expected = [...new Set(input)].map(fixtureEvent).sort((a, b) => a.id.localeCompare(b.id));
        const saveOrder = async (order: LearnEvent[]) => {
          await resetLearningDbForTests();
          await initializeLearningStorage();
          for (const event of order) await queueLearnEvent(event);
          for (const event of order) await queueLearnEvent(event);
          return (await (await getLearningDb()).getAll('outbox')).map((record) => record.event).sort((a, b) => a.id.localeCompare(b.id));
        };
        const forward = input.map(fixtureEvent);
        const first = await saveOrder(forward);
        const reverse = await saveOrder([...forward].reverse());
        expect(first).toEqual(expected);
        expect(reverse).toEqual(expected);
      }),
      { numRuns: 12 },
    );
  });

  it('persists offline events, posts them on reconnect, acknowledges only server-confirmed IDs, and pulls a snapshot', async () => {
    await initializeLearningStorage();
    const server: Array<{ seq: number; event: LearnEvent }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/events' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { events: LearnEvent[] };
        const events = body.events.map((event) => {
          const old = server.find((row) => row.event.id === event.id);
          if (old) return { id: event.id, seq: old.seq, duplicate: true };
          const seq = server.length + 1;
          server.push({ seq, event });
          return { id: event.id, seq, duplicate: false };
        });
        return Response.json({ events, cursor: server.length });
      }
      if (url.pathname === '/snapshot') {
        const cursor = Number(url.searchParams.get('cursor') ?? 0),
          through = server.length;
        const events = server
          .filter((row) => row.seq > cursor && row.seq <= through)
          .slice(0, Number(url.searchParams.get('limit') ?? 100));
        const next = events.at(-1)?.seq ?? cursor;
        return Response.json({ events, cursor: next, through, snapshotCursor: through, hasMore: next < through });
      }
      if (url.pathname === '/sync') return Response.json({ events: [], cursor: server.length, through: server.length, hasMore: false });
      return Response.json({ error: 'not found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher), random: () => 0 });
    await runtime.start();
    emitLearnEvent(
      { bankVersion: 'v21', session: 's-1', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' },
      { type: 'check_answer', itemId: 'q-1', userAnswer: '{1,2}', verdict: 'submitted', verdictSource: 'none' },
    );
    await vi.waitFor(async () => expect(await readOutboxCount()).toBe(1));
    expect(runtime.getSnapshot().phase).toBe('needs-auth');
    runtime.setIdToken('owner-id-token');
    await runtime.syncNow();
    expect(runtime.getSnapshot().phase).toBe('synced');
    expect(runtime.getSnapshot().pending).toBe(0);
    expect(server).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/events'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer owner-id-token' }) }),
    );
    runtime.stop();
  });

  it('retains the outbox during a network failure and retries after an online event', async () => {
    await initializeLearningStorage();
    let online = false;
    const server: Array<{ seq: number; event: LearnEvent }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!online) throw new TypeError('offline');
      const url = new URL(String(input));
      if (url.pathname === '/events') {
        const body = JSON.parse(String(init?.body)) as { events: LearnEvent[] };
        const ack = body.events.map((event) => {
          const existing = server.find((row) => row.event.id === event.id);
          if (existing) return { id: event.id, seq: existing.seq, duplicate: true };
          const seq = server.length + 1;
          server.push({ seq, event });
          return { id: event.id, seq, duplicate: false };
        });
        return Response.json({ events: ack, cursor: server.length });
      }
      if (url.pathname === '/snapshot')
        return Response.json({
          events: server,
          cursor: server.length,
          through: server.length,
          snapshotCursor: server.length,
          hasMore: false,
        });
      if (url.pathname === '/sync') return Response.json({ events: [], cursor: server.length, through: server.length, hasMore: false });
      return Response.json({ error: 'not found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher), random: () => 0 });
    await runtime.start();
    emitLearnEvent(
      { bankVersion: 'v21', session: 's-1', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' },
      { type: 'lesson_open' },
    );
    await vi.waitFor(async () => expect(await readOutboxCount()).toBe(1));
    runtime.setIdToken('owner-id-token');
    await runtime.syncNow();
    expect(runtime.getSnapshot().phase).toBe('retrying');
    expect(await readOutboxCount()).toBe(1);
    online = true;
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(async () => expect(runtime.getSnapshot().phase).toBe('synced'));
    expect(await readOutboxCount()).toBe(0);
    runtime.stop();
  });

  it('retains every event when the server omits an acknowledgement ID', async () => {
    await initializeLearningStorage();
    await queueLearnEvent(fixtureEvent(101));
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
      new URL(String(input)).pathname === '/reset/epoch'
        ? Response.json({ epoch: LEARNING_RESET_EPOCH })
        : Response.json({ events: [], cursor: 0 }),
    );
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher), random: () => 0 });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await runtime.syncNow();
    expect(runtime.getSnapshot()).toMatchObject({ phase: 'retrying', pending: 1 });
    expect(await readOutboxCount()).toBe(1);
    runtime.stop();
  });

  it('keeps the outbox and requests reauthentication after a server 401', async () => {
    await initializeLearningStorage();
    await queueLearnEvent(fixtureEvent(102));
    const fetcher = vi.fn(async () => Response.json({ error: 'unauthorized' }, { status: 401 }));
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    await runtime.start();
    runtime.setIdToken('expired-id-token');
    await runtime.syncNow();
    expect(runtime.getSnapshot()).toMatchObject({ phase: 'needs-auth', pending: 1, lastError: 'ورود گوگل منقضی شده است؛ دوباره متصل شو.' });
    expect(await readOutboxCount()).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    runtime.stop();
  });

  it('holds an event larger than the server batch limit and reports a non-retryable error', async () => {
    await initializeLearningStorage();
    const oversized = { ...fixtureEvent(103), questionText: 'x'.repeat(200_000) } as LearnEvent;
    await queueLearnEvent(oversized);
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
      new URL(String(input)).pathname === '/reset/epoch'
        ? Response.json({ epoch: LEARNING_RESET_EPOCH })
        : Response.json({ events: [], cursor: 0 }),
    );
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await runtime.syncNow();
    expect(runtime.getSnapshot()).toMatchObject({ phase: 'error', pending: 1 });
    expect(runtime.getSnapshot().lastError).toMatch(/حد مجاز سرور/);
    expect(fetcher.mock.calls.some(([input, init]) => new URL(String(input)).pathname === '/events' && init?.method === 'POST')).toBe(
      false,
    );
    expect(await readOutboxCount()).toBe(1);
    runtime.stop();
  });
});
