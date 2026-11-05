import { afterEach, describe, expect, it, vi } from 'vitest';
import { readServerSnapshot, ServerBackedStorage } from '../../src/sync/server-storage';

afterEach(() => vi.unstubAllGlobals());

describe('server-only editor persistence', () => {
  it('authenticates the snapshot read and accepts revision-preserving tombstones', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({
      revision: 4,
      records: [
        { key: 'math-scratchpad-session-v3', value: '{"a":1}', revision: 3 },
        { key: 'math-scratchpad-ui-v1:questions', value: null, revision: 1 },
      ],
    }));
    vi.stubGlobal('fetch', fetcher);
    const snapshot = await readServerSnapshot('owner-token');
    expect(snapshot.records).toHaveLength(2);
    const headers = new Headers(fetcher.mock.calls[0][1]?.headers);
    expect(headers.get('Authorization')).toBe('Bearer owner-token');
    const storage = new ServerBackedStorage(snapshot.records, 'owner-token');
    expect(storage.getItem('math-scratchpad-ui-v1:questions')).toBeNull();
    expect(storage.getItem('math-scratchpad-session-v3')).toBe('{"a":1}');
  });

  it('writes and removes the editor state directly through the owner Worker', async () => {
    const writes: Array<{ key: string; value: string | null; revision: number }> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { key: string; value: string | null; revision: number };
      writes.push(body);
      return Response.json({ key: body.key, revision: body.revision + 1 });
    }));
    const storage = new ServerBackedStorage([], 'owner-token');
    storage.setItem('math-scratchpad-session-v3', '{"step":"1/2"}');
    await storage.flush();
    storage.removeItem('math-scratchpad-session-v3');
    await storage.flush();
    storage.setItem('math-scratchpad-session-v3', '{"step":"2/3"}');
    await storage.flush();
    expect(writes.map(x => x.revision)).toEqual([0, 1, 2]);
    expect(writes.map(x => x.value)).toEqual(['{"step":"1/2"}', null, '{"step":"2/3"}']);
    expect(storage.getItem('math-scratchpad-session-v3')).toBe('{"step":"2/3"}');
  });

  it('automatically retries transient failures but never conceals a version conflict', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      return calls === 1 ? Response.json({ error: 'unavailable' }, { status: 503 })
        : Response.json({ revision: 1 });
    }));
    const storage = new ServerBackedStorage([], 'owner-token');
    storage.setItem('math-scratchpad-session-v3', '{"step":1}');
    await storage.flush();
    expect(calls).toBe(2);

    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'state_conflict', revision: 2 }, { status: 409 })));
    storage.setItem('math-scratchpad-session-v3', '{"step":2}');
    await expect(storage.flush()).rejects.toThrow(/دستگاه دیگری/);
  });

  it('retries only the latest queued value after an earlier write fails', async () => {
    const writes: Array<{ key: string; value: string | null; revision: number }> = [];
    let serverValue: string | null = null;
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { key: string; value: string | null; revision: number };
      writes.push(body);
      calls += 1;
      if (calls === 1) return Response.json({ error: 'payload_too_large' }, { status: 413 });
      serverValue = body.value;
      return Response.json({ key: body.key, revision: body.revision + 1 });
    }));
    const storage = new ServerBackedStorage([], 'owner-token');
    storage.setItem('math-scratchpad-session-v3', '{"step":1}');
    storage.setItem('math-scratchpad-session-v3', '{"step":2}');

    await storage.flush();

    expect(writes.map(write => write.value)).toEqual(['{"step":1}', '{"step":2}']);
    expect(serverValue).toBe('{"step":2}');
    expect(storage.getItem('math-scratchpad-session-v3')).toBe('{"step":2}');
  });

});
