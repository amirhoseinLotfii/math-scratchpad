import { describe, expect, it, vi } from 'vitest';
import { emitLearnEvent, type LearnEvent } from '../../../src/sync/events';
import { initializeLearningStorage, readOutboxCount } from '../../../src/sync/browser-db';
import { BrowserSyncRuntime } from '../../../src/sync/runtime';
import { withIdleResetStatus, createManualScheduler } from '../../helpers/browser-sync';
describe('browser sync runtime', () => {
  it('debounces event pushes and sends the queued events together with a stable idempotency key', async () => {
    await initializeLearningStorage();
    const posted: Array<{ body: { events: LearnEvent[] }; init?: RequestInit }> = [];
    const clock = createManualScheduler();
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/events') {
        const body = JSON.parse(String(init?.body)) as { events: LearnEvent[] };
        posted.push({ body, init });
        return Response.json({
          events: body.events.map((event, index) => ({ id: event.id, seq: index + 1, duplicate: false })),
          cursor: body.events.length,
        });
      }
      if (url.pathname === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      if (url.pathname === '/sync') return Response.json({ events: [], cursor: 0, through: 0, hasMore: false });
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({
      apiOrigin: 'https://sync.example',
      fetcher: withIdleResetStatus(fetcher),
      scheduleTimeout: clock.schedule,
      cancelTimeout: clock.cancel,
    });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await vi.waitFor(() => expect(runtime.getSnapshot().phase).toBe('synced'));

    for (let index = 0; index < 10; index += 1) {
      emitLearnEvent(
        { bankVersion: 'v21', session: `debounce-${index}`, chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' },
        { type: 'lesson_open' },
      );
    }
    await vi.waitFor(async () => expect(await readOutboxCount()).toBe(10));

    expect(posted).toHaveLength(0);
    clock.advance(3_399);
    expect(posted).toHaveLength(0);
    clock.advance(1);
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]?.body.events).toHaveLength(10);
    expect(posted[0]?.init?.headers).toMatchObject({
      'Idempotency-Key': `events-${posted[0]?.body.events.map((event) => event.id).join('.')}`,
    });
    expect(await readOutboxCount()).toBe(0);
    runtime.stop();
  });

  it('flushes continuing activity by the 30-second max wait', async () => {
    await initializeLearningStorage();
    const posted: LearnEvent[][] = [];
    const clock = createManualScheduler();
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/events') {
        const body = JSON.parse(String(init?.body)) as { events: LearnEvent[] };
        posted.push(body.events);
        return Response.json({
          events: body.events.map((event, index) => ({ id: event.id, seq: index + 1, duplicate: false })),
          cursor: body.events.length,
        });
      }
      if (url.pathname === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      if (url.pathname === '/sync') return Response.json({ events: [], cursor: 0, through: 0, hasMore: false });
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({
      apiOrigin: 'https://sync.example',
      fetcher: withIdleResetStatus(fetcher),
      scheduleTimeout: clock.schedule,
      cancelTimeout: clock.cancel,
    });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await vi.waitFor(() => expect(runtime.getSnapshot().phase).toBe('synced'));

    for (let index = 0; index < 10; index += 1) {
      if (index > 0) clock.advance(3_200);
      emitLearnEvent(
        { bankVersion: 'v21', session: `max-wait-${index}`, chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' },
        { type: 'lesson_open' },
      );
      await vi.waitFor(async () => expect(await readOutboxCount()).toBe(index + 1));
    }
    expect(posted).toHaveLength(0);
    clock.advance(1_199);
    expect(posted).toHaveLength(0);
    clock.advance(1);
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toHaveLength(10);
    expect(await readOutboxCount()).toBe(0);
    runtime.stop();
  });
});
