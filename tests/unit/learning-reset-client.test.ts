import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerBackedStorage } from '../../src/sync/server-storage';
import { BrowserSyncRuntime } from '../../src/sync/runtime';
import {
  LEARNING_RESET_EPOCH,
  LEARNING_RESET_EPOCH_HEADER,
  LOCAL_SERVER_RESET_EPOCH_KEY,
} from '../../src/sync/learning-reset-epoch';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('learning reset client epoch', () => {
  it('adds the current epoch to BrowserSyncRuntime requests', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ ok: true }));
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: fetcher as typeof fetch });
    runtime.setIdToken('test-owner-token');

    await (runtime as unknown as {
      request(path: string, init: RequestInit): Promise<Response>;
    }).request('/events', { method: 'POST' });

    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get(LEARNING_RESET_EPOCH_HEADER)).toBe(LEARNING_RESET_EPOCH);
    expect(headers.get('Authorization')).toBe('Bearer test-owner-token');
    runtime.stop();
  });

  it('adds the current epoch to direct server-state writes', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ revision: 1 }));
    vi.stubGlobal('fetch', fetcher);
    const storage = new ServerBackedStorage([], 'test-owner-token');
    storage.setItem('math-scratchpad-session-v3', '{"answer":"new"}');
    await storage.flush();

    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get(LEARNING_RESET_EPOCH_HEADER)).toBe(LEARNING_RESET_EPOCH);
    expect(headers.get('Authorization')).toBe('Bearer test-owner-token');
  });

  it('uses the reconciled server generation on direct server-state writes', async () => {
    const epoch = 'server-generation-43';
    localStorage.setItem(LOCAL_SERVER_RESET_EPOCH_KEY, epoch);
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ revision: 1 }));
    vi.stubGlobal('fetch', fetcher);
    const storage = new ServerBackedStorage([], 'test-owner-token');
    storage.setItem('math-scratchpad-session-v3', '{"answer":"new"}');
    await storage.flush();

    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get(LEARNING_RESET_EPOCH_HEADER)).toBe(epoch);
  });

  it('uses the server-issued generation on learning writes after preflight', async () => {
    const epoch = 'server-generation-42';
    localStorage.setItem(LOCAL_SERVER_RESET_EPOCH_KEY, epoch);
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (new URL(String(input)).pathname === '/reset/epoch') return Response.json({ epoch });
      return Response.json({ events: [], cursor: 0 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: fetcher as typeof fetch });
    runtime.setIdToken('test-owner-token');

    expect(await runtime.refreshServerResetEpoch('test-owner-token')).toBe(true);
    await (runtime as unknown as { request(path: string, init: RequestInit): Promise<Response> })
      .request('/events', { method: 'POST' });

    const headers = new Headers(fetcher.mock.calls.at(-1)?.[1]?.headers);
    expect(headers.get(LEARNING_RESET_EPOCH_HEADER)).toBe(epoch);
    runtime.stop();
  });
});
