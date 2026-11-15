import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flushLearningStorage, getAuthenticatedServerStorage, getLearningDb, getLearningStorage,
  initializeAuthenticatedServerStorage, initializeLearningStorage, resetLearningDbForTests,
} from '../../../src/sync/browser-db';

const key = 'math-scratchpad-session-v3';
const content = (length: number) => JSON.stringify({ work: 'م'.repeat(length) });

beforeEach(async () => {
  localStorage.clear();
  await initializeLearningStorage();
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await resetLearningDbForTests();
});

describe('cloud state size budget', () => {
  it('posts a 900 KB value', async () => {
    const writes: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== 'POST') return Response.json({ records: [], revision: 0 });
      writes.push(JSON.parse(String(init.body)).value);
      return Response.json({ key, revision: 1 });
    }));
    await initializeAuthenticatedServerStorage('owner-token');
    const value = content(450_000);
    getLearningStorage().setItem(key, value);
    await getAuthenticatedServerStorage()!.flush();
    expect(writes).toEqual([value]);
  });

  it('keeps a 1.1 MB value byte-identical on disk and does not retry it on reconnect', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST'
      ? Response.json({ error: 'payload_too_large' }, { status: 413 })
      : Response.json({ records: [], revision: 0 }));
    vi.stubGlobal('fetch', fetcher);
    await initializeAuthenticatedServerStorage('owner-token');
    const value = content(550_000);
    getLearningStorage().setItem(key, value);
    await flushLearningStorage();
    const storage = getAuthenticatedServerStorage()!;
    for (let index = 0; index < 3; index++) {
      storage.setToken('owner-token');
      await storage.flush();
    }
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    expect(storage.getOversizedState().get(key)).toEqual({ status: 'too_large', bytes: 1_100_011 });
    storage.applyRemote([]);
    expect((await (await getLearningDb()).get('cache', key))?.value === value).toBe(true);
    expect(getLearningStorage().getItem(key) === value).toBe(true);
  });

  it('classifies the typed server 413 permanently and resumes after the value changes', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== 'POST') return Response.json({ records: [], revision: 0 });
      if (JSON.parse(String(init.body)).value === 'too large on server') {
        return Response.json({ error: 'state_value_too_large', key, bytes: 1_000_001, limit: 1_000_000 }, { status: 413 });
      }
      return Response.json({ key, revision: 1 });
    });
    vi.stubGlobal('fetch', fetcher);
    await initializeAuthenticatedServerStorage('owner-token');
    const storage = getAuthenticatedServerStorage()!;
    getLearningStorage().setItem(key, 'too large on server');
    await storage.flush();
    expect(storage.getOversizedState().get(key)).toEqual({ status: 'too_large', bytes: 1_000_001 });
    storage.setToken('owner-token');
    await storage.flush();
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    getLearningStorage().setItem(key, 'fits');
    await storage.flush();
    expect(storage.getOversizedState().has(key)).toBe(false);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2);
  });
});
