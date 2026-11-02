import 'fake-indexeddb/auto';
import fc from 'fast-check';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState } from '../../src/store';
import { serialize } from '../../src/persistence';
import { emitLearnEvent, resetLearnEventRuntimeForTests, type LearnEvent } from '../../src/sync/events';
import {
  clearVerifiedLegacyKeys,
  getLearningDb,
  getLearningStorage,
  initializeLearningStorage,
  flushLearningStorage,
  queueLearnEvent,
  readLegacyMigration,
  readOutboxCount,
  resetLearningDbForTests,
  storeServerEvents,
  writeLearningItem,
} from '../../src/sync/browser-db';
import {
  finishLegacyMigration,
  legacyMigrationBackupContents,
  markLegacyMigrationDriveVerified,
  queueLegacyMigration,
  verifyLegacyMigrationOnServer,
} from '../../src/sync/legacy-migration';
import { BrowserSyncRuntime } from '../../src/sync/runtime';

const SESSION_KEY = 'math-scratchpad-session-v3';
const LESSON_KEY = 'math-scratchpad-lesson-progress-v1:bank%2F1:v21';
const OLD_SESSION = serialize(initialState());
const OLD_LESSON = JSON.stringify({ schemaVersion: 1, bankId: 'bank/1', bankVersion: 'v21', lessons: { '1.1': { status: 'learning', checkAnswers: { q1: 'دامنه' } } }, lessonPanelEvents: [] });

function fixtureEvent(index: number): LearnEvent {
  const suffix = index.toString(16).padStart(12, '0');
  return {
    id: `00000000-0000-4000-8000-${suffix}`,
    schema: 1,
    ts: '2026-11-02T00:00:00.000Z',
    deviceId: '11111111-1111-4111-8111-111111111111',
    bankVersion: 'v21', session: 'property-test', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations',
    type: 'check_answer', itemId: `q-${index}`, userAnswer: String(index), verdict: 'submitted', verdictSource: 'none',
  };
}

function seedLegacy() {
  localStorage.setItem(SESSION_KEY, OLD_SESSION);
  localStorage.setItem(LESSON_KEY, OLD_LESSON);
  localStorage.setItem('math-scratchpad-ui-v1:questions', '0');
  localStorage.setItem('math-scratchpad-drive-bank-cache-v1:bank', '{"cached":true}');
}

beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto as unknown as Crypto);
  localStorage.clear();
  await resetLearningDbForTests();
  resetLearnEventRuntimeForTests();
});

afterEach(async () => {
  vi.useRealTimers();
  resetLearnEventRuntimeForTests();
  await resetLearningDbForTests();
  vi.unstubAllGlobals();
});

describe('IndexedDB learning cache and legacy migration', () => {
  it('copies learning records and safe caches into IndexedDB, retaining legacy progress until verification', async () => {
    seedLegacy();
    const bootstrap = await initializeLearningStorage();
    expect(bootstrap.dbAvailable).toBe(true);
    expect(bootstrap.migration?.entries.map(entry => entry.key).sort()).toEqual([LESSON_KEY, SESSION_KEY]);
    expect(bootstrap.storage.getItem(SESSION_KEY)).toBe(OLD_SESSION);
    expect(bootstrap.storage.getItem(LESSON_KEY)).toBe(OLD_LESSON);
    expect(localStorage.getItem(SESSION_KEY)).toBe(OLD_SESSION);
    expect(localStorage.getItem(LESSON_KEY)).toBe(OLD_LESSON);
    expect(localStorage.getItem('math-scratchpad-ui-v1:questions')).toBe('0');
    expect(localStorage.getItem('math-scratchpad-drive-bank-cache-v1:bank')).toBeNull();
    expect(bootstrap.storage.getItem('math-scratchpad-drive-bank-cache-v1:bank')).toBe('{"cached":true}');
    const db = await getLearningDb();
    expect((await db.get('cache', SESSION_KEY))?.value).toBe(OLD_SESSION);
  });

  it('keeps legacy values readable and blocks writes when IndexedDB bootstrap fails mid-copy', async () => {
    seedLegacy();
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === 'cache') throw new DOMException('Quota full', 'QuotaExceededError');
      return originalPut.call(this, value, key);
    };
    let bootstrap: Awaited<ReturnType<typeof initializeLearningStorage>> | undefined;
    try { bootstrap = await initializeLearningStorage(); }
    finally { IDBObjectStore.prototype.put = originalPut; }

    expect(bootstrap?.dbAvailable).toBe(false);
    expect(bootstrap?.storage.getItem(SESSION_KEY)).toBe(OLD_SESSION);
    expect(localStorage.getItem(SESSION_KEY)).toBe(OLD_SESSION);
    expect(() => getLearningStorage().setItem(SESSION_KEY, 'new draft')).toThrow(/IndexedDB is not available/);
    expect(localStorage.getItem(SESSION_KEY)).toBe(OLD_SESSION);
  });

  it('writes new session data to IDB without putting learning data back into localStorage', async () => {
    await initializeLearningStorage();
    const storage = getLearningStorage();
    storage.setItem(SESSION_KEY, '{"new":"work"}');
    await flushLearningStorage();
    const db = await getLearningDb();
    await db.get('cache', SESSION_KEY);
    expect((await db.get('cache', SESSION_KEY))?.value).toBe('{"new":"work"}');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('supports the Storage facade contract and awaits a durable write before returning', async () => {
    await initializeLearningStorage();
    await writeLearningItem('math-scratchpad-session-v3', '{"saved":true}');
    const storage = getLearningStorage();
    storage.setItem('math-scratchpad-session-v3:second', '{"second":true}');
    await flushLearningStorage();
    expect(storage.length).toBe(2);
    expect([storage.key(0), storage.key(1)]).toEqual(['math-scratchpad-session-v3', 'math-scratchpad-session-v3:second']);
    expect(storage.getItem('math-scratchpad-session-v3')).toBe('{"saved":true}');
    storage.removeItem('math-scratchpad-session-v3:second');
    await flushLearningStorage();
    expect(storage.getItem('math-scratchpad-session-v3:second')).toBeNull();
    storage.clear();
    await flushLearningStorage();
    expect(storage.length).toBe(0);
  });

  it('refuses to clear a legacy key that changed after its migration snapshot', async () => {
    seedLegacy();
    const { migration } = await initializeLearningStorage();
    expect(migration).not.toBeNull();
    localStorage.setItem(SESSION_KEY, 'newer work');
    const result = await clearVerifiedLegacyKeys(migration!);
    expect(result.cleared).toEqual([]);
    expect(result.changed).toContain(SESSION_KEY);
    expect(localStorage.getItem(SESSION_KEY)).toBe('newer work');
    expect(localStorage.getItem(LESSON_KEY)).toBe(OLD_LESSON);
  });

  it('chunks exact legacy bytes, verifies the server copy by count and SHA-256, and gates local cleanup on Drive read-back', async () => {
    seedLegacy();
    const { migration: initial } = await initializeLearningStorage();
    const queued = await queueLegacyMigration();
    expect(queued?.eventIds.length).toBeGreaterThan(0);
    expect(await readOutboxCount()).toBe(queued?.eventIds.length);

    const db = await getLearningDb();
    const events = await db.getAll('outbox');
    await storeServerEvents(events.map((entry, index) => ({ seq: index + 1, event: entry.event })));
    const verified = await verifyLegacyMigrationOnServer();
    expect(verified.status).toBe('server-verified');
    expect(verified.entries.map(entry => entry.sha256)).toEqual(expect.arrayContaining([expect.stringMatching(/^[a-f0-9]{64}$/)]));
    const backup = legacyMigrationBackupContents(verified);
    expect(JSON.parse(backup)).toMatchObject({ format: 'math-scratchpad-learning-backup/v1', migrationId: initial?.id });
    expect(JSON.parse(backup).entries.find((entry: { key: string }) => entry.key === LESSON_KEY).value).toBe(OLD_LESSON);

    const driveVerified = await markLegacyMigrationDriveVerified(verified, { id: 'drive-file-id', name: 'backup.json' });
    expect(localStorage.getItem(SESSION_KEY)).toBe(OLD_SESSION);
    const result = await finishLegacyMigration();
    expect(result.migration.status).toBe('complete');
    expect(result.cleared.sort()).toEqual([LESSON_KEY, SESSION_KEY]);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(LESSON_KEY)).toBeNull();
    expect(driveVerified.backupFileId).toBe('drive-file-id');
  });

  it('keeps every legacy key if a server chunk fails its hash check', async () => {
    seedLegacy();
    await initializeLearningStorage();
    const migration = await queueLegacyMigration();
    const db = await getLearningDb();
    const events = await db.getAll('outbox');
    const tampered = events.map((entry, index) => ({ seq: index + 1, event: entry.event }));
    const first = tampered[0];
    first.event = { ...first.event, migrationChunk: { ...first.event.migrationChunk!, data: 'e30=' } };
    await storeServerEvents(tampered);
    await expect(verifyLegacyMigrationOnServer()).rejects.toThrow(/SHA-256|incomplete/i);
    expect((await readLegacyMigration())?.status).toBe('pending');
    expect(localStorage.getItem(SESSION_KEY)).toBe(OLD_SESSION);
    expect(localStorage.getItem(LESSON_KEY)).toBe(OLD_LESSON);
    expect(migration?.status).toBe('pending');
  });
});

describe('browser sync runtime', () => {
  it('is commutative under event order and idempotent under duplicate delivery', async () => {
    await fc.assert(fc.asyncProperty(fc.array(fc.integer({ min: 0, max: 25 }), { maxLength: 30 }), async input => {
      const expected = [...new Set(input)].map(fixtureEvent).sort((a, b) => a.id.localeCompare(b.id));
      const saveOrder = async (order: LearnEvent[]) => {
        await resetLearningDbForTests();
        await initializeLearningStorage();
        for (const event of order) await queueLearnEvent(event);
        for (const event of order) await queueLearnEvent(event);
        return (await (await getLearningDb()).getAll('outbox')).map(record => record.event).sort((a, b) => a.id.localeCompare(b.id));
      };
      const forward = input.map(fixtureEvent);
      const first = await saveOrder(forward);
      const reverse = await saveOrder([...forward].reverse());
      expect(first).toEqual(expected);
      expect(reverse).toEqual(expected);
    }), { numRuns: 12 });
  });

  it('persists offline events, posts them on reconnect, acknowledges only server-confirmed IDs, and pulls a snapshot', async () => {
    await initializeLearningStorage();
    const server: Array<{ seq: number; event: LearnEvent }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/events' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { events: LearnEvent[] };
        const events = body.events.map(event => {
          const old = server.find(row => row.event.id === event.id);
          if (old) return { id: event.id, seq: old.seq, duplicate: true };
          const seq = server.length + 1; server.push({ seq, event });
          return { id: event.id, seq, duplicate: false };
        });
        return Response.json({ events, cursor: server.length });
      }
      if (url.pathname === '/snapshot') {
        const cursor = Number(url.searchParams.get('cursor') ?? 0), through = server.length;
        const events = server.filter(row => row.seq > cursor && row.seq <= through).slice(0, Number(url.searchParams.get('limit') ?? 100));
        const next = events.at(-1)?.seq ?? cursor;
        return Response.json({ events, cursor: next, through, snapshotCursor: through, hasMore: next < through });
      }
      if (url.pathname === '/sync') return Response.json({ events: [], cursor: server.length, through: server.length, hasMore: false });
      return Response.json({ error: 'not found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher, random: () => 0 });
    await runtime.start();
    emitLearnEvent({ bankVersion: 'v21', session: 's-1', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' }, { type: 'check_answer', itemId: 'q-1', userAnswer: '{1,2}', verdict: 'submitted', verdictSource: 'none' });
    await vi.waitFor(async () => expect(await readOutboxCount()).toBe(1));
    expect(runtime.getSnapshot().phase).toBe('needs-auth');
    runtime.setIdToken('owner-id-token');
    await runtime.syncNow();
    expect(runtime.getSnapshot().phase).toBe('synced');
    expect(runtime.getSnapshot().pending).toBe(0);
    expect(server).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/events'), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer owner-id-token' }) }));
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
        const ack = body.events.map(event => {
          const existing = server.find(row => row.event.id === event.id);
          if (existing) return { id: event.id, seq: existing.seq, duplicate: true };
          const seq = server.length + 1; server.push({ seq, event });
          return { id: event.id, seq, duplicate: false };
        });
        return Response.json({ events: ack, cursor: server.length });
      }
      if (url.pathname === '/snapshot') return Response.json({ events: server, cursor: server.length, through: server.length, snapshotCursor: server.length, hasMore: false });
      if (url.pathname === '/sync') return Response.json({ events: [], cursor: server.length, through: server.length, hasMore: false });
      return Response.json({ error: 'not found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher, random: () => 0 });
    await runtime.start();
    emitLearnEvent({ bankVersion: 'v21', session: 's-1', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' }, { type: 'lesson_open' });
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
    const fetcher = vi.fn(async () => Response.json({ events: [], cursor: 0 }));
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher, random: () => 0 });
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
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher });
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
    const fetcher = vi.fn();
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await runtime.syncNow();
    expect(runtime.getSnapshot()).toMatchObject({ phase: 'error', pending: 1 });
    expect(runtime.getSnapshot().lastError).toMatch(/حد مجاز سرور/);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await readOutboxCount()).toBe(1);
    runtime.stop();
  });
});
