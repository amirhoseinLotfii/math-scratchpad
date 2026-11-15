import { describe, expect, it, vi } from 'vitest';
import { initializeLearningStorage } from '../../../src/sync/browser-db';
import { BrowserSyncRuntime } from '../../../src/sync/runtime';
import { withIdleResetStatus } from '../../helpers/browser-sync';
describe('mirror status', () => {
  it('reports separate Drive and Notion states and runs the configured mirrors manually', async () => {
    await initializeLearningStorage();
    const calls: Array<{ path: string; method: string }> = [];
    let drive: Record<string, unknown> = {
      status: 'pending',
      pendingCount: 3,
      lastSyncedAt: '2026-11-02T01:00:00.000Z',
      lastError: null,
    };
    let notion: Record<string, unknown> = {
      status: 'error',
      pendingCount: 2,
      lastSyncedAt: '2026-11-02T00:30:00.000Z',
      lastError: 'database_not_shared',
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      calls.push({ path: url.pathname, method });
      if (url.pathname === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      if (url.pathname === '/sync') return Response.json({ events: [], cursor: 0, through: 0, hasMore: false });
      if (url.pathname === '/drive/status') return Response.json(drive);
      if (url.pathname === '/notion/status') return Response.json(notion);
      if (url.pathname === '/drive/sync' && method === 'POST') {
        drive = { status: 'synced', pendingCount: 0, lastSyncedAt: '2026-11-02T01:15:00.000Z', lastError: null };
        return Response.json({ drive });
      }
      if (url.pathname === '/notion/sync' && method === 'POST') {
        notion = { status: 'synced', pendingCount: 0, lastSyncedAt: '2026-11-02T01:15:00.000Z', lastError: null };
        return Response.json({ notion });
      }
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await runtime.syncNow();
    await runtime.refreshMirrorStatuses();
    expect(runtime.getSnapshot()).toMatchObject({
      driveMirror: { status: 'pending', pendingCount: 3 },
      notionMirror: { status: 'error', pendingCount: 2, lastError: 'database_not_shared' },
    });

    await runtime.syncAllNow();

    expect(runtime.getSnapshot()).toMatchObject({
      driveMirror: { status: 'synced', pendingCount: 0 },
      notionMirror: { status: 'synced', pendingCount: 0 },
    });
    expect(calls).toContainEqual({ path: '/drive/sync', method: 'POST' });
    expect(calls).toContainEqual({ path: '/notion/sync', method: 'POST' });
    runtime.stop();
  });

  it('reports a Drive failure without blocking a successful Notion sync or clearing the local cache', async () => {
    await initializeLearningStorage();
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      if (path === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      if (path === '/sync') return Response.json({ events: [], cursor: 0, through: 0, hasMore: false });
      if (path === '/drive/status')
        return Response.json({ status: 'error', pendingCount: 5, lastSyncedAt: null, lastError: 'reauthorization_required' });
      if (path === '/notion/status')
        return Response.json({ status: 'synced', pendingCount: 0, lastSyncedAt: '2026-11-03T18:00:00.000Z', lastError: null });
      if (path === '/drive/sync' && init?.method === 'POST') {
        return Response.json(
          { drive: { status: 'error', pendingCount: 5, lastSyncedAt: null, lastError: 'reauthorization_required' } },
          { status: 502 },
        );
      }
      if (path === '/notion/sync' && init?.method === 'POST') return Response.json({ notion: { status: 'synced' } });
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await runtime.syncNow();
    await expect(runtime.syncAllNow()).rejects.toThrow('Drive: reauthorization_required');
    expect(calls).toContain('POST /drive/sync');
    expect(calls).toContain('POST /notion/sync');
    expect(runtime.getSnapshot()).toMatchObject({
      driveMirror: { status: 'error', pendingCount: 5, lastError: 'reauthorization_required' },
      notionMirror: { status: 'synced', pendingCount: 0 },
    });
    runtime.stop();
  });

  it('does not issue manual writes to a mirror marked not configured', async () => {
    await initializeLearningStorage();
    const calls: Array<{ path: string; method: string }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input)),
        method = init?.method ?? 'GET';
      calls.push({ path: url.pathname, method });
      if (url.pathname === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      if (url.pathname === '/sync') return Response.json({ events: [], cursor: 0, through: 0, hasMore: false });
      if (url.pathname === '/drive/status')
        return Response.json({ status: 'synced', pendingCount: 0, lastSyncedAt: null, lastError: null });
      if (url.pathname === '/notion/status')
        return Response.json({ status: 'not_configured', pendingCount: 4, lastSyncedAt: null, lastError: null });
      if (url.pathname === '/drive/sync' && method === 'POST')
        return Response.json({ drive: { status: 'synced', pendingCount: 0, lastSyncedAt: null, lastError: null } });
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await runtime.syncNow();
    await runtime.refreshMirrorStatuses();
    await runtime.syncAllNow();

    expect(calls).toContainEqual({ path: '/drive/sync', method: 'POST' });
    expect(calls).not.toContainEqual({ path: '/notion/sync', method: 'POST' });
    expect(runtime.getSnapshot().notionMirror).toMatchObject({ status: 'not_configured', pendingCount: 4 });
    runtime.stop();
  });

  it('completes a chapter sync barrier when only Drive is configured', async () => {
    await initializeLearningStorage();
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input)),
        method = init?.method ?? 'GET';
      if (url.pathname === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      if (url.pathname === '/sync') return Response.json({ events: [], cursor: 0, through: 0, hasMore: false });
      if (url.pathname === '/drive/status' || (url.pathname === '/drive/sync' && method === 'POST')) {
        return Response.json({
          status: 'synced',
          pendingCount: 0,
          lastSyncedAt: null,
          lastError: null,
          drive: { status: 'synced', pendingCount: 0, lastSyncedAt: null, lastError: null },
        });
      }
      if (url.pathname === '/notion/status')
        return Response.json({ status: 'not_configured', pendingCount: 0, lastSyncedAt: null, lastError: null });
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await runtime.syncNow();
    await expect(runtime.syncAllUntilComplete(2_000)).resolves.toBeUndefined();
    runtime.stop();
  });
});
