import { describe, expect, it, vi } from 'vitest';
import { emitLearnEvent, type LearnEvent } from '../../../src/sync/events';
import { initializeLearningStorage, readOutboxCount } from '../../../src/sync/browser-db';
import { BrowserSyncRuntime } from '../../../src/sync/runtime';
import { LEARNING_RESET_EPOCH } from '../../../src/sync/learning-reset-epoch';
import { withIdleResetStatus, stubSendBeacon, readBlobText } from '../../helpers/browser-sync';
describe('exit flush', () => {
  it('queues one small durable pagehide batch with sendBeacon and leaves it for retry', async () => {
    await initializeLearningStorage();
    const beacons: Array<{ url: string; data: BodyInit | null }> = [];
    const sendBeacon = vi.fn((url: string | URL, data?: BodyInit | null) => {
      beacons.push({ url: String(url), data: data ?? null });
      return true;
    });
    stubSendBeacon(sendBeacon);
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      if (url.pathname === '/sync') return Response.json({ events: [], cursor: 0, through: 0, hasMore: false });
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await vi.waitFor(() => expect(runtime.getSnapshot().phase).toBe('synced'));
    emitLearnEvent(
      { bankVersion: 'v21', session: 'pagehide', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' },
      { type: 'lesson_open' },
    );
    await vi.waitFor(async () => expect(await readOutboxCount()).toBe(1));

    window.dispatchEvent(new Event('pagehide'));
    await vi.waitFor(() => expect(sendBeacon).toHaveBeenCalledTimes(1));
    expect(beacons).toHaveLength(1);
    expect(beacons[0]?.url).toBe('https://sync.example/events/beacon');
    expect(beacons[0]?.data).toBeInstanceOf(Blob);
    const body = JSON.parse(await readBlobText(beacons[0]?.data as Blob)) as { sessionToken: string; epoch: string; events: LearnEvent[] };
    expect(body).toMatchObject({ sessionToken: 'owner-id-token', epoch: LEARNING_RESET_EPOCH });
    expect(body.events).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([input]) => new URL(String(input)).pathname === '/events')).toHaveLength(0);
    expect(await readOutboxCount()).toBe(1);
    runtime.stop();
  });

  it('flushes a durable pagehide batch while a regular sync is still waiting on its snapshot', async () => {
    await initializeLearningStorage();
    let resolveSnapshot: ((response: Response) => void) | undefined;
    let snapshotRequested = false;
    let posted: { init?: RequestInit; body: { events: LearnEvent[] } } | undefined;
    const beacons: Array<{ url: string; data: BodyInit | null }> = [];
    const sendBeacon = vi.fn((url: string | URL, data?: BodyInit | null) => {
      beacons.push({ url: String(url), data: data ?? null });
      return true;
    });
    stubSendBeacon(sendBeacon);
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/events') {
        const body = JSON.parse(String(init?.body)) as { events: LearnEvent[] };
        posted = { init, body };
        return Response.json({
          events: body.events.map((event, index) => ({ id: event.id, seq: index + 1, duplicate: false })),
          cursor: body.events.length,
        });
      }
      if (url.pathname === '/snapshot') {
        snapshotRequested = true;
        return await new Promise<Response>((resolve) => {
          resolveSnapshot = resolve;
        });
      }
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await vi.waitFor(() => expect(snapshotRequested).toBe(true));

    emitLearnEvent(
      { bankVersion: 'v21', session: 'pagehide-during-sync', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' },
      { type: 'lesson_open' },
    );
    await vi.waitFor(async () => expect(await readOutboxCount()).toBe(1));
    window.dispatchEvent(new Event('pagehide'));
    await vi.waitFor(() => expect(sendBeacon).toHaveBeenCalledTimes(1));
    const beaconBody = JSON.parse(await readBlobText(beacons[0]?.data as Blob)) as { events: LearnEvent[] };
    expect(beaconBody.events).toHaveLength(1);
    expect(posted).toBeUndefined();
    expect(await readOutboxCount()).toBe(1);

    resolveSnapshot?.(Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false }));
    await vi.waitFor(() => expect(posted).toBeDefined());
    await vi.waitFor(async () => expect(await readOutboxCount()).toBe(0));
    runtime.stop();
  });

  it('queues one hidden-page beacon even when pagehide follows visibilitychange', async () => {
    await initializeLearningStorage();
    const beacons: Array<{ url: string; data: BodyInit | null }> = [];
    const sendBeacon = vi.fn((url: string | URL, data?: BodyInit | null) => {
      beacons.push({ url: String(url), data: data ?? null });
      return true;
    });
    stubSendBeacon(sendBeacon);
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/reset/epoch') return Response.json({ epoch: LEARNING_RESET_EPOCH });
      if (url.pathname === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await vi.waitFor(() => expect(runtime.getSnapshot().phase).toBe('synced'));
    emitLearnEvent(
      { bankVersion: 'v21', session: 'hidden-page', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' },
      { type: 'lesson_open' },
    );
    await vi.waitFor(async () => expect(await readOutboxCount()).toBe(1));

    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(sendBeacon).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event('pagehide'));
    expect(fetcher.mock.calls.filter(([input]) => new URL(String(input)).pathname === '/events')).toHaveLength(0);
    expect(beacons).toHaveLength(1);
    expect(await readOutboxCount()).toBe(1);
    visibility.mockRestore();
    runtime.stop();
  });

  it('keeps an offline pagehide batch durable and sends it after a reload', async () => {
    await initializeLearningStorage();
    const posted: Array<{ body: { events: LearnEvent[] }; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/reset/epoch') return Response.json({ epoch: LEARNING_RESET_EPOCH });
      if (url.pathname === '/events') {
        const body = JSON.parse(String(init?.body)) as { events: LearnEvent[] };
        posted.push({ body, init });
        return Response.json({
          events: body.events.map((event, index) => ({ id: event.id, seq: index + 1, duplicate: false })),
          cursor: body.events.length,
        });
      }
      if (url.pathname === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await vi.waitFor(() => expect(runtime.getSnapshot().phase).toBe('synced'));
    emitLearnEvent(
      { bankVersion: 'v21', session: 'offline-pagehide', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' },
      { type: 'lesson_open' },
    );
    await vi.waitFor(async () => expect(await readOutboxCount()).toBe(1));

    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('pagehide'));
    expect(fetcher.mock.calls.filter(([input]) => new URL(String(input)).pathname === '/events')).toHaveLength(0);
    expect(await readOutboxCount()).toBe(1);
    online.mockRestore();
    runtime.stop();

    const reloadedRuntime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    await reloadedRuntime.start();
    reloadedRuntime.setIdToken('owner-id-token');
    await vi.waitFor(async () => expect(await readOutboxCount()).toBe(0));
    expect(posted).toHaveLength(1);
    expect(posted[0]?.body.events).toHaveLength(1);
    reloadedRuntime.stop();
  });
});
