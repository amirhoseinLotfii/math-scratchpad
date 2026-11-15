import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerBackedStorage } from '../../../src/sync/server-storage';

const session = 'math-scratchpad-session-v3';
const settings = 'math-scratchpad-ui-v1:questions';
let storage: ServerBackedStorage;
let writes: Array<{ key: string; value: string }>;

beforeEach(() => {
  vi.useFakeTimers();
  writes = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { key: string; value: string; revision: number };
    writes.push(body);
    return Response.json({ revision: body.revision + 1 });
  }));
  storage = new ServerBackedStorage([], 'owner-token');
});
afterEach(async () => {
  await storage.flush();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('coalesced state mirror', () => {
  it('sends the latest value per key only after 3.4 seconds idle', async () => {
    for (let index = 0; index < 20; index++) {
      storage.setItem(session, String(index));
      if (index < 19) await vi.advanceTimersByTimeAsync(150);
    }
    expect(storage.hasPendingWrites).toBe(true);
    expect(writes).toHaveLength(0);
    storage.setItem(settings, 'open');
    await vi.advanceTimersByTimeAsync(3399);
    expect(writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(writes).toEqual([
      { key: session, value: '19', revision: 0 },
      { key: settings, value: 'open', revision: 0 },
    ]);
    expect(storage.hasPendingWrites).toBe(false);
  });

  it('flushes by 30 seconds when the same key keeps changing', async () => {
    for (let index = 0; index < 10; index++) {
      storage.setItem(session, String(index));
      if (index < 9) await vi.advanceTimersByTimeAsync(3200);
    }
    await vi.advanceTimersByTimeAsync(1199);
    expect(writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(writes).toEqual([{ key: session, value: '9', revision: 0 }]);
  });

  it('flushes other keys when a write hits a revision conflict', async () => {
    let rejected = false;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return Response.json({ revision: 1, records: [{ key: session, value: 'remote', revision: 1 }] });
      const body = JSON.parse(String(init.body)) as { key: string; value: string; revision: number };
      writes.push(body);
      if (!rejected) {
        rejected = true;
        return Response.json({ error: 'state_conflict', revision: 1 }, { status: 409 });
      }
      return Response.json({ revision: body.revision + 1 });
    }));
    storage.setItem(session, 'local');
    await vi.advanceTimersByTimeAsync(200);
    storage.setItem(settings, 'open');
    await vi.advanceTimersByTimeAsync(3200);
    expect(writes.some(write => write.key === settings)).toBe(true);
  });

  it('flushes immediately on renewed authentication or an explicit sync', async () => {
    storage.setItem(session, 'first');
    expect(writes).toHaveLength(0);
    storage.setToken('renewed-owner-token');
    await vi.advanceTimersByTimeAsync(0);
    expect(writes).toHaveLength(1);
    storage.setItem(session, 'second');
    await storage.flush();
    expect(writes.map(write => write.value)).toEqual(['first', 'second']);
  });
});
