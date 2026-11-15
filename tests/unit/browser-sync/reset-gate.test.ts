import { describe, expect, it, vi } from 'vitest';
import { emitLearnEvent, type LearnEvent } from '../../../src/sync/events';
import { initializeLearningStorage, queueLearnEvent, readOutboxCount } from '../../../src/sync/browser-db';
import { BrowserSyncRuntime } from '../../../src/sync/runtime';
import { LEARNING_RESET_EPOCH, markLocalLearningResetPending } from '../../../src/sync/learning-reset-epoch';
import { withIdleResetStatus, fixtureEvent, createManualScheduler } from '../../helpers/browser-sync';
describe('reset gate', () => {
  it('queues local learning data without sending while the local reset guard is active', async () => {
    localStorage.setItem('math-scratchpad-local-learning-reset-pending-v1', '1');
    const fetcher = vi.fn(async () => Response.json({ events: [], cursor: 0 }));
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    await runtime.start();
    emitLearnEvent(
      { bankVersion: 'v21', session: 'reset-pending', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' },
      { type: 'lesson_open' },
    );
    runtime.setIdToken('owner-session-token');
    await runtime.syncNow();
    await vi.waitFor(async () => expect(await readOutboxCount()).toBe(1));

    expect(await readOutboxCount()).toBe(1);
    expect(fetcher).not.toHaveBeenCalled();
    expect(runtime.getSnapshot().phase).toBe('needs-auth');
    runtime.stop();
  });

  it('blocks debounce, max-wait, wake, visibility, and pagehide triggers after reset begins', async () => {
    await initializeLearningStorage();
    const clock = createManualScheduler();
    const writes: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (init?.method === 'POST') writes.push(path);
      if (path === '/reset/epoch') return Response.json({ epoch: LEARNING_RESET_EPOCH });
      if (path === '/events') {
        const body = JSON.parse(String(init?.body)) as { events: LearnEvent[] };
        return Response.json({
          events: body.events.map((event, index) => ({ id: event.id, seq: index + 1, duplicate: false })),
          cursor: body.events.length,
        });
      }
      if (path === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      if (path === '/sync') return Response.json({ events: [], cursor: 0, through: 0, hasMore: false });
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
    emitLearnEvent(
      { bankVersion: 'v21', session: 'guard-paths', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' },
      { type: 'lesson_open' },
    );
    await vi.waitFor(async () => expect(await readOutboxCount()).toBe(1));

    markLocalLearningResetPending();
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pageshow'));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    clock.advance(30_000);
    await Promise.resolve();

    expect(writes).toEqual([]);
    expect(await readOutboxCount()).toBe(1);
    runtime.stop();
  });

  it('cancels a scheduled retry when reset begins', async () => {
    await initializeLearningStorage();
    await queueLearnEvent(fixtureEvent(105));
    const eventPosts: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path === '/reset/epoch') return Response.json({ epoch: LEARNING_RESET_EPOCH });
      if (path === '/events') {
        eventPosts.push(path);
        return Response.json({ error: 'temporary' }, { status: 503 });
      }
      if (path === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher), random: () => 0 });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await runtime.syncNow();
    expect(runtime.getSnapshot().phase).toBe('retrying');
    expect(eventPosts).toHaveLength(1);

    markLocalLearningResetPending();
    await new Promise((resolve) => setTimeout(resolve, 900));

    expect(eventPosts).toHaveLength(1);
    expect(await readOutboxCount()).toBe(1);
    runtime.stop();
  });

  it('keeps an event queued when reset starts during its in-flight request', async () => {
    await initializeLearningStorage();
    const event = fixtureEvent(104);
    await queueLearnEvent(event);
    let resolvePost: ((response: Response) => void) | undefined;
    let postSignal: AbortSignal | null | undefined;
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      calls.push(path);
      if (path === '/reset/epoch') return Response.json({ epoch: LEARNING_RESET_EPOCH });
      if (path === '/events')
        return new Promise<Response>((resolve) => {
          resolvePost = resolve;
          postSignal = init?.signal;
        });
      if (path === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await vi.waitFor(() => expect(resolvePost).toBeTypeOf('function'));

    markLocalLearningResetPending();
    resolvePost?.(Response.json({ events: [{ id: event.id, seq: 1, duplicate: false }], cursor: 1 }));
    await runtime.syncNow();

    expect(await readOutboxCount()).toBe(1);
    expect(postSignal?.aborted).toBe(true);
    expect(calls).not.toContain('/snapshot');
    runtime.stop();
  });
});
