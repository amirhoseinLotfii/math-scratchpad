import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerBackedStorage } from '../../src/sync/server-storage';
import { BrowserSyncRuntime } from '../../src/sync/runtime';
import { LEARNING_RESET_EPOCH, LEARNING_RESET_EPOCH_HEADER } from '../../src/sync/learning-reset-epoch';

afterEach(() => vi.unstubAllGlobals());

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
});
