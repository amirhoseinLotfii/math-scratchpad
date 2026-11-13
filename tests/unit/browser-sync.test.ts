import 'fake-indexeddb/auto';
import fc from 'fast-check';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Ensure Node.js webcrypto is available as globalThis.crypto for tests
// In jsdom, globalThis.crypto is a getter-only property, so we need to redefine it
Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
  writable: true,
  configurable: true,
  enumerable: true
});
import { actions, initialState } from '../../src/store';
import { serialize } from '../../src/persistence';
import { createPersistentStore } from '../../src/features/session/persistence/persistent-store';
import { emitLearnEvent, resetLearnEventRuntimeForTests, type LearnEvent } from '../../src/sync/events';
import {
  clearVerifiedLegacyKeys,
  getAuthenticatedServerStorage,
  getLearningDb,
  getLearningStorage,
  initializeLearningStorage,
  initializeAuthenticatedServerStorage,
  flushLearningStorage,
  queueLearnEvent,
  readLegacyMigration,
  readOutboxCount,
  resetLearningDbForTests,
  storeServerEvents,
  withLegacyMigrationLock,
  writeLearningItem,
  writeLegacyMigration,
  type LegacyMigration,
} from '../../src/sync/browser-db';
import {
  backupAndFinishLegacyMigration,
  finishLegacyMigration,
  legacyMigrationBackupContents,
  markLegacyMigrationDriveVerified,
  queueLegacyMigration,
  verifyLegacyMigrationOnServer,
} from '../../src/sync/legacy-migration';
import { BrowserSyncRuntime } from '../../src/sync/runtime';
import { LEARNING_RESET_EPOCH, markLocalLearningResetPending } from '../../src/sync/learning-reset-epoch';

const SESSION_KEY = 'math-scratchpad-session-v3';
const LESSON_KEY = 'math-scratchpad-lesson-progress-v1:bank%2F1:v21';
const OLD_SESSION = serialize(initialState());
const OLD_LESSON = JSON.stringify({ schemaVersion: 1, bankId: 'bank/1', bankVersion: 'v21', lessons: { '1.1': { status: 'learning', checkAnswers: { q1: 'دامنه' } } }, lessonPanelEvents: [] });

function withIdleResetStatus(fetcher: typeof fetch): typeof fetch {
  return async (input, init) => {
    if (new URL(String(input)).pathname === '/reset/status') {
      return Response.json({ status: 'idle', epoch: LEARNING_RESET_EPOCH });
    }
    return fetcher(input, init);
  };
}

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

function createManualScheduler() {
  type Handle = ReturnType<typeof setTimeout>;
  let now = 0;
  let id = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const schedule = ((callback: TimerHandler, delay?: number) => {
    const timerId = ++id;
    timers.set(timerId, { at: now + Number(delay ?? 0), callback: () => typeof callback === 'function' ? callback() : undefined });
    return timerId as unknown as Handle;
  }) as unknown as typeof globalThis.setTimeout;
  const cancel = ((handle: Handle) => { timers.delete(Number(handle)); }) as typeof globalThis.clearTimeout;
  const advance = (milliseconds: number) => {
    const target = now + milliseconds;
    while (true) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at;
      timers.delete(due[0]);
      due[1].callback();
    }
    now = target;
  };
  return { schedule, cancel, advance };
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


  it('keeps large Drive bank caches local and mirrors only durable learner state', async () => {
    const writes: Array<{ key: string; value: string | null; revision: number }> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { key: string; value: string | null; revision: number };
        writes.push(body);
        return Response.json({ key: body.key, revision: body.revision + 1, updatedAt: new Date().toISOString() });
      }
      return Response.json({ records: [], revision: 0 });
    }));
    await initializeLearningStorage();
    await initializeAuthenticatedServerStorage('owner-token');

    const bankKey = 'math-scratchpad-drive-bank-cache-v1:large-bank';
    const bankValue = 'q'.repeat(260_000);
    getLearningStorage().setItem(bankKey, bankValue);
    getLearningStorage().setItem(SESSION_KEY, '{"draft":"saved locally"}');
    await flushLearningStorage();
    await getAuthenticatedServerStorage()?.flush();

    const db = await getLearningDb();
    expect((await db.get('cache', bankKey))?.value).toBe(bankValue);
    expect((await db.get('cache', SESSION_KEY))?.value).toBe('{"draft":"saved locally"}');
    expect(writes.map(write => write.key)).toEqual([SESSION_KEY]);
  });

  it('uses a newer server learner record to restore the local copy after another device updated it', async () => {
    const remoteValue = '{"draft":"newer server copy"}';
    vi.stubGlobal('fetch', vi.fn(async (_url: string) => Response.json({
      revision: 5,
      records: [{ key: SESSION_KEY, value: remoteValue, revision: 4, updatedAt: '2099-01-01T00:00:00.000Z' }],
    })));
    await initializeLearningStorage();
    getLearningStorage().setItem(SESSION_KEY, '{"draft":"older local copy"}');
    await flushLearningStorage();

    await initializeAuthenticatedServerStorage('owner-token');

    const db = await getLearningDb();
    expect((await db.get('cache', SESSION_KEY))?.value).toBe(remoteValue);
  });

  it('restores cloud learner data when this browser starts with an empty local database', async () => {
    const remoteValue = '{"lesson":"restored from cloud"}';
    const writes: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        writes.push(JSON.parse(String(init.body)));
        return Response.json({ key: LESSON_KEY, revision: 8, updatedAt: '2026-11-11T00:00:00.000Z' });
      }
      return Response.json({ revision: 7, records: [{ key: LESSON_KEY, value: remoteValue, revision: 7, updatedAt: '2026-11-10T00:00:00.000Z' }] });
    }));

    await initializeLearningStorage();
    expect(getLearningStorage().getItem(LESSON_KEY)).toBeNull();
    await initializeAuthenticatedServerStorage('owner-token');

    expect(getLearningStorage().getItem(LESSON_KEY)).toBe(remoteValue);
    const db = await getLearningDb();
    expect((await db.get('cache', LESSON_KEY))?.value).toBe(remoteValue);
    await initializeAuthenticatedServerStorage('owner-token');
    expect(getLearningStorage().getItem(LESSON_KEY)).toBe(remoteValue);
    expect(writes).toEqual([]);
  });

  it('merges a remote prompt change into the active session while preserving the latest local answer', async () => {
    const initial = initialState();
    const initialValue = JSON.stringify({ version: 3, state: {
      session: { doc: initial.doc, prefs: initial.prefs, keyboardOpen: false },
      sync: { revision: 1, writerId: 'seed-device' },
    } });
    localStorage.setItem(SESSION_KEY, initialValue);
    let serverRecord = { key: SESSION_KEY, value: initialValue, revision: 1 };
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { key: string; value: string | null; revision: number };
        if (body.revision !== serverRecord.revision) return Response.json({ error: 'state_conflict', revision: serverRecord.revision }, { status: 409 });
        serverRecord = { key: body.key, value: body.value ?? '', revision: body.revision + 1 };
        return Response.json({ key: body.key, revision: serverRecord.revision });
      }
      return Response.json({ revision: serverRecord.revision, records: [serverRecord] });
    }));

    await initializeLearningStorage();
    const runtime = createPersistentStore();
    try {
      await initializeAuthenticatedServerStorage('owner-token');
      runtime.store.dispatch(actions.command({ type: 'digit', value: '7' }));
      await runtime.flush();
      await getAuthenticatedServerStorage()?.flush();

      const changedElsewhere = JSON.parse(serverRecord.value);
      changedElsewhere.state.session.doc.exercises[0].prompt = 'Changed on another device';
      changedElsewhere.state.sync = { revision: 3, writerId: 'other-device' };
      serverRecord = { ...serverRecord, value: JSON.stringify(changedElsewhere), revision: 3 };

      runtime.store.dispatch(actions.command({ type: 'digit', value: '8' }));
      await runtime.flush();
      const localWork = structuredClone(runtime.store.getState().doc);
      await getAuthenticatedServerStorage()?.flush();

      expect(runtime.store.getState().doc.exercises[0]?.prompt).toBe('Changed on another device');
      expect(runtime.store.getState().doc.exercises[0]?.steps).toEqual(localWork.exercises[0]?.steps);
      const savedOnServer = JSON.parse(serverRecord.value);
      expect(savedOnServer.state.session.doc.exercises[0].prompt).toBe('Changed on another device');
      expect(savedOnServer.state.session.doc.exercises[0].steps).toEqual(localWork.exercises[0]?.steps);
    } finally {
      runtime.dispose();
    }
  });

  it('keeps local learner state durable when the server rejects its mirror write', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Response.json({ error: 'payload_too_large' }, { status: 413 });
      return Response.json({ records: [], revision: 0 });
    }));
    await initializeLearningStorage();
    await initializeAuthenticatedServerStorage('owner-token');
    getLearningStorage().setItem(SESSION_KEY, '{"draft":"local copy"}');

    await expect(flushLearningStorage()).resolves.toBeUndefined();
    const db = await getLearningDb();
    expect((await db.get('cache', SESSION_KEY))?.value).toBe('{"draft":"local copy"}');
    await expect(getAuthenticatedServerStorage()?.flush()).rejects.toThrow();
  });

  it('does not write server-backed state while the reset-pending guard is active', async () => {
    const writes: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        writes.push(JSON.parse(String(init.body)));
        return Response.json({ revision: 1 });
      }
      return Response.json({ records: [], revision: 0 });
    }));
    await initializeLearningStorage();
    await initializeAuthenticatedServerStorage('owner-token');

    localStorage.setItem('math-scratchpad-local-learning-reset-pending-v1', '1');
    getLearningStorage().setItem(SESSION_KEY, '{"draft":"saved locally"}');
    await flushLearningStorage();
    await expect(getAuthenticatedServerStorage()?.flush()).rejects.toThrow('ارسال تا تأیید پایان پاک‌سازی متوقف است.');

    expect(writes).toHaveLength(0);
    expect(await (await getLearningDb()).get('cache', SESSION_KEY)).toMatchObject({ value: '{"draft":"saved locally"}' });
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


  it('serializes concurrent migration lock holders instead of running in parallel', async () => {
    let active = 0;
    let maximumActive = 0;
    const hold = () => withLegacyMigrationLock(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setTimeout(resolve, 25));
      active -= 1;
    });
    await Promise.all([hold(), hold()]);
    expect(maximumActive).toBe(1);
  });

  it('shares one legacy snapshot between independent tab module instances', async () => {
    seedLegacy();
    const firstTab = await import('../../src/sync/browser-db');
    vi.resetModules();
    const secondTab = await import('../../src/sync/browser-db');
    const [first, second] = await Promise.all([
      firstTab.initializeLearningStorage(),
      secondTab.initializeLearningStorage(),
    ]);
    expect(first.migration?.id).toBeTruthy();
    expect(second.migration?.id).toBe(first.migration?.id);
    expect(second.migration?.entries).toEqual(first.migration?.entries);
    const firstConnection = await firstTab.getLearningDb();
    const secondConnection = await secondTab.getLearningDb();
    firstConnection.close();
    secondConnection.close();
    await secondTab.resetLearningDbForTests();
  });

  it('reuses stable event IDs when two migration queue requests race', async () => {
    seedLegacy();
    await initializeLearningStorage();
    const [first, second] = await Promise.all([queueLegacyMigration(), queueLegacyMigration()]);
    expect(first?.id).toBe(second?.id);
    expect(first?.eventIds).toEqual(second?.eventIds);
    expect(await readOutboxCount()).toBe(first?.eventIds.length);
  });

  it('rejects a stale migration ID before starting a Drive upload', async () => {
    seedLegacy();
    await initializeLearningStorage();
    const queued = await queueLegacyMigration();
    const verified = { ...queued!, status: 'server-verified' as const, serverVerifiedAt: '2026-11-03T06:00:00.000Z' };
    await writeLegacyMigration(verified);
    const createBackup = vi.fn(async () => ({ id: 'backup-id', name: 'backup.json' }));
    await expect(backupAndFinishLegacyMigration('stale-migration-id', createBackup)).rejects.toThrow(/changed in another tab/i);
    expect(createBackup).not.toHaveBeenCalled();
    expect(localStorage.getItem(SESSION_KEY)).toBe(OLD_SESSION);
  });

  it('re-reads a completed migration after folder selection and does not create a second backup', async () => {
    seedLegacy();
    await initializeLearningStorage();
    const queued = await queueLegacyMigration();
    const complete = {
      ...queued!,
      status: 'complete' as const,
      backupFileId: 'existing-backup',
      backupFileName: 'backup.json',
      backupVerifiedAt: '2026-11-03T06:00:00.000Z',
    };
    await writeLegacyMigration(complete);
    const createBackup = vi.fn(async () => ({ id: 'duplicate', name: 'duplicate.json' }));
    const result = await backupAndFinishLegacyMigration(complete.id, createBackup);
    expect(result).toMatchObject({ migration: { status: 'complete' }, file: { id: 'existing-backup' }, reused: true });
    expect(createBackup).not.toHaveBeenCalled();
    expect(localStorage.getItem(SESSION_KEY)).toBe(OLD_SESSION);
  });

  it('serializes concurrent Drive backup attempts and uploads only once', async () => {
    seedLegacy();
    await initializeLearningStorage();
    const queued = await queueLegacyMigration();
    const verified = { ...queued!, status: 'server-verified' as const, serverVerifiedAt: '2026-11-03T06:00:00.000Z' };
    await writeLegacyMigration(verified);
    const createBackup = vi.fn(async (_migration: LegacyMigration, contents: string) => {
      expect(JSON.parse(contents)).toMatchObject({ migrationId: verified.id });
      await new Promise(resolve => setTimeout(resolve, 30));
      return { id: 'single-backup', name: 'backup.json' };
    });
    const [first, second] = await Promise.all([
      backupAndFinishLegacyMigration(verified.id, createBackup),
      backupAndFinishLegacyMigration(verified.id, createBackup),
    ]);
    expect(createBackup).toHaveBeenCalledTimes(1);
    expect(first.migration.status).toBe('complete');
    expect(second.migration.status).toBe('complete');
    expect([first.reused, second.reused].sort()).toEqual([false, true]);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(LESSON_KEY)).toBeNull();
  });

  it('retains all legacy values and the verified state when Drive upload fails', async () => {
    seedLegacy();
    await initializeLearningStorage();
    const queued = await queueLegacyMigration();
    const verified = { ...queued!, status: 'server-verified' as const, serverVerifiedAt: '2026-11-03T06:00:00.000Z' };
    await writeLegacyMigration(verified);
    await expect(backupAndFinishLegacyMigration(verified.id, async () => {
      throw new Error('Drive upload failed');
    })).rejects.toThrow('Drive upload failed');
    expect((await readLegacyMigration())?.status).toBe('server-verified');
    expect(localStorage.getItem(SESSION_KEY)).toBe(OLD_SESSION);
    expect(localStorage.getItem(LESSON_KEY)).toBe(OLD_LESSON);
  });

  it('refuses to record a Drive backup against a stale migration ID', async () => {
    seedLegacy();
    await initializeLearningStorage();
    const queued = await queueLegacyMigration();
    const verified = { ...queued!, status: 'server-verified' as const, serverVerifiedAt: '2026-11-03T06:00:00.000Z' };
    await writeLegacyMigration(verified);
    await expect(markLegacyMigrationDriveVerified({ ...verified, id: 'different-id' }, { id: 'backup-id', name: 'backup.json' }))
      .rejects.toThrow(/changed in another tab/i);
    expect((await readLegacyMigration())?.status).toBe('server-verified');
  });

  it('refuses to record a Drive backup when the saved migration manifest changed', async () => {
    seedLegacy();
    await initializeLearningStorage();
    const queued = await queueLegacyMigration();
    const verified = { ...queued!, status: 'server-verified' as const, serverVerifiedAt: '2026-11-03T06:00:00.000Z' };
    await writeLegacyMigration({ ...verified, entries: [...verified.entries, { key: 'unexpected', value: 'new', sha256: '' }] });
    await expect(markLegacyMigrationDriveVerified(verified, { id: 'backup-id', name: 'backup.json' }))
      .rejects.toThrow(/snapshot changed/i);
    expect((await readLegacyMigration())?.status).toBe('server-verified');
  });

  it('refuses cleanup when Drive backup metadata is incomplete', async () => {
    seedLegacy();
    await initializeLearningStorage();
    const queued = await queueLegacyMigration();
    await writeLegacyMigration({
      ...queued!,
      status: 'drive-backed-up',
      backupVerifiedAt: '2026-11-03T06:00:00.000Z',
      backupFileName: 'backup.json',
    });
    await expect(finishLegacyMigration()).rejects.toThrow(/must be verified/i);
    expect(localStorage.getItem(SESSION_KEY)).toBe(OLD_SESSION);
    expect(localStorage.getItem(LESSON_KEY)).toBe(OLD_LESSON);
  });

  it('preserves changed and newly added learning keys during verified cleanup', async () => {
    seedLegacy();
    await initializeLearningStorage();
    const queued = await queueLegacyMigration();
    const backedUp = {
      ...queued!,
      status: 'drive-backed-up' as const,
      backupFileId: 'backup-id',
      backupFileName: 'backup.json',
      backupVerifiedAt: '2026-11-03T06:00:00.000Z',
    };
    localStorage.setItem(SESSION_KEY, 'newer work');
    localStorage.setItem('math-scratchpad-lesson-progress-v1:new', 'new progress');
    const result = await clearVerifiedLegacyKeys(backedUp);
    expect(result.cleared).toEqual([]);
    expect(result.changed).toEqual(expect.arrayContaining([SESSION_KEY, 'math-scratchpad-lesson-progress-v1:new']));
    expect(localStorage.getItem(SESSION_KEY)).toBe('newer work');
    expect(localStorage.getItem(LESSON_KEY)).toBe(OLD_LESSON);
  });

  it('resumes partial cleanup after the verified Drive backup without losing the remaining key', async () => {
    seedLegacy();
    await initializeLearningStorage();
    const queued = await queueLegacyMigration();
    const backedUp = {
      ...queued!,
      status: 'drive-backed-up' as const,
      backupFileId: 'backup-id',
      backupFileName: 'backup.json',
      backupVerifiedAt: '2026-11-03T06:00:00.000Z',
    };
    await writeLegacyMigration(backedUp);
    localStorage.removeItem(SESSION_KEY);
    const result = await finishLegacyMigration();
    expect(result.migration.status).toBe('complete');
    expect(result.cleared.sort()).toEqual([LESSON_KEY, SESSION_KEY]);
    expect(localStorage.getItem(LESSON_KEY)).toBeNull();
  });

  it('makes final migration cleanup idempotent after another tab completed it', async () => {
    seedLegacy();
    await initializeLearningStorage();
    const queued = await queueLegacyMigration();
    await writeLegacyMigration({
      ...queued!,
      status: 'drive-backed-up',
      backupFileId: 'backup-id',
      backupFileName: 'backup.json',
      backupVerifiedAt: '2026-11-03T06:00:00.000Z',
    });
    const first = await finishLegacyMigration();
    const second = await finishLegacyMigration();
    expect(first.migration.status).toBe('complete');
    expect(second.migration.status).toBe('complete');
    expect(second.cleared).toEqual([]);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(LESSON_KEY)).toBeNull();
  });

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
        return Response.json({ events: body.events.map((event, index) => ({ id: event.id, seq: index + 1, duplicate: false })), cursor: body.events.length });
      }
      if (url.pathname === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      if (url.pathname === '/sync') return Response.json({ events: [], cursor: 0, through: 0, hasMore: false });
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher), scheduleTimeout: clock.schedule, cancelTimeout: clock.cancel });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await vi.waitFor(() => expect(runtime.getSnapshot().phase).toBe('synced'));

    for (let index = 0; index < 10; index += 1) {
      emitLearnEvent({ bankVersion: 'v21', session: `debounce-${index}`, chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' }, { type: 'lesson_open' });
    }
    await vi.waitFor(async () => expect(await readOutboxCount()).toBe(10));

    expect(posted).toHaveLength(0);
    clock.advance(4_999);
    expect(posted).toHaveLength(0);
    clock.advance(1);
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]?.body.events).toHaveLength(10);
    expect(posted[0]?.init?.headers).toMatchObject({
      'Idempotency-Key': `events-${posted[0]?.body.events.map(event => event.id).join('.')}`,
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
        return Response.json({ events: body.events.map((event, index) => ({ id: event.id, seq: index + 1, duplicate: false })), cursor: body.events.length });
      }
      if (url.pathname === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      if (url.pathname === '/sync') return Response.json({ events: [], cursor: 0, through: 0, hasMore: false });
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher), scheduleTimeout: clock.schedule, cancelTimeout: clock.cancel });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await vi.waitFor(() => expect(runtime.getSnapshot().phase).toBe('synced'));

    for (let index = 0; index < 8; index += 1) {
      if (index > 0) clock.advance(4_000);
      emitLearnEvent({ bankVersion: 'v21', session: `max-wait-${index}`, chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' }, { type: 'lesson_open' });
      await vi.waitFor(async () => expect(await readOutboxCount()).toBe(index + 1));
    }
    expect(posted).toHaveLength(0);
    clock.advance(2_000);
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toHaveLength(8);
    expect(await readOutboxCount()).toBe(0);
    runtime.stop();
  });

  it('flushes one small durable batch with fetch keepalive on pagehide', async () => {
    await initializeLearningStorage();
    let posted: { init?: RequestInit; body: { events: LearnEvent[] } } | undefined;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/events') {
        const body = JSON.parse(String(init?.body)) as { events: LearnEvent[] };
        posted = { init, body };
        return Response.json({ events: body.events.map((event, index) => ({ id: event.id, seq: index + 1, duplicate: false })), cursor: body.events.length });
      }
      if (url.pathname === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      if (url.pathname === '/sync') return Response.json({ events: [], cursor: 0, through: 0, hasMore: false });
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await vi.waitFor(() => expect(runtime.getSnapshot().phase).toBe('synced'));
    emitLearnEvent({ bankVersion: 'v21', session: 'pagehide', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' }, { type: 'lesson_open' });
    await vi.waitFor(async () => expect(await readOutboxCount()).toBe(1));

    window.dispatchEvent(new Event('pagehide'));
    await vi.waitFor(() => expect(posted).toBeDefined());
    expect(posted?.body.events).toHaveLength(1);
    expect(posted?.init?.keepalive).toBe(true);
    await vi.waitFor(async () => expect(await readOutboxCount()).toBe(0));
    runtime.stop();
  });

  it('flushes a hidden page once even when pagehide arrives during the same keepalive request', async () => {
    await initializeLearningStorage();
    let resolvePost: ((response: Response) => void) | undefined;
    let posted: { init?: RequestInit; body: { events: LearnEvent[] } } | undefined;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/reset/epoch') return Response.json({ epoch: LEARNING_RESET_EPOCH });
      if (url.pathname === '/events') {
        posted = { init, body: JSON.parse(String(init?.body)) as { events: LearnEvent[] } };
        return await new Promise<Response>(resolve => { resolvePost = resolve; });
      }
      if (url.pathname === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await vi.waitFor(() => expect(runtime.getSnapshot().phase).toBe('synced'));
    emitLearnEvent({ bankVersion: 'v21', session: 'hidden-page', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' }, { type: 'lesson_open' });
    await vi.waitFor(async () => expect(await readOutboxCount()).toBe(1));

    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(posted).toBeDefined());
    window.dispatchEvent(new Event('pagehide'));
    expect(fetcher.mock.calls.filter(([input]) => new URL(String(input)).pathname === '/events')).toHaveLength(1);
    expect(posted?.init?.keepalive).toBe(true);
    expect(await readOutboxCount()).toBe(1);

    resolvePost?.(Response.json({ events: posted!.body.events.map((event, index) => ({ id: event.id, seq: index + 1, duplicate: false })), cursor: posted!.body.events.length }));
    await vi.waitFor(async () => expect(await readOutboxCount()).toBe(0));
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
        return Response.json({ events: body.events.map((event, index) => ({ id: event.id, seq: index + 1, duplicate: false })), cursor: body.events.length });
      }
      if (url.pathname === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await vi.waitFor(() => expect(runtime.getSnapshot().phase).toBe('synced'));
    emitLearnEvent({ bankVersion: 'v21', session: 'offline-pagehide', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' }, { type: 'lesson_open' });
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

  it('queues local learning data without sending while the local reset guard is active', async () => {
    localStorage.setItem('math-scratchpad-local-learning-reset-pending-v1', '1');
    const fetcher = vi.fn(async () => Response.json({ events: [], cursor: 0 }));
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    await runtime.start();
    emitLearnEvent({ bankVersion: 'v21', session: 'reset-pending', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' }, { type: 'lesson_open' });
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
        return Response.json({ events: body.events.map((event, index) => ({ id: event.id, seq: index + 1, duplicate: false })), cursor: body.events.length });
      }
      if (path === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      if (path === '/sync') return Response.json({ events: [], cursor: 0, through: 0, hasMore: false });
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher), scheduleTimeout: clock.schedule, cancelTimeout: clock.cancel });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await vi.waitFor(() => expect(runtime.getSnapshot().phase).toBe('synced'));
    emitLearnEvent({ bankVersion: 'v21', session: 'guard-paths', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations' }, { type: 'lesson_open' });
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
    await new Promise(resolve => setTimeout(resolve, 900));

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
      if (path === '/events') return new Promise<Response>(resolve => { resolvePost = resolve; postSignal = init?.signal; });
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
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher), random: () => 0 });
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
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher), random: () => 0 });
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
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => new URL(String(input)).pathname === '/reset/epoch'
      ? Response.json({ epoch: LEARNING_RESET_EPOCH })
      : Response.json({ events: [], cursor: 0 }));
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher), random: () => 0 });
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
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
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
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => new URL(String(input)).pathname === '/reset/epoch'
      ? Response.json({ epoch: LEARNING_RESET_EPOCH })
      : Response.json({ events: [], cursor: 0 }));
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await runtime.syncNow();
    expect(runtime.getSnapshot()).toMatchObject({ phase: 'error', pending: 1 });
    expect(runtime.getSnapshot().lastError).toMatch(/حد مجاز سرور/);
    expect(fetcher.mock.calls.some(([input, init]) => new URL(String(input)).pathname === '/events' && init?.method === 'POST')).toBe(false);
    expect(await readOutboxCount()).toBe(1);
    runtime.stop();
  });

  it('reports separate Drive and Notion states and runs the configured mirrors manually', async () => {
    await initializeLearningStorage();
    const calls: Array<{ path: string; method: string }> = [];
    let drive: Record<string, unknown> = {
      status: 'pending', pendingCount: 3, lastSyncedAt: '2026-11-02T01:00:00.000Z', lastError: null,
    };
    let notion: Record<string, unknown> = {
      status: 'error', pendingCount: 2, lastSyncedAt: '2026-11-02T00:30:00.000Z', lastError: 'database_not_shared',
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
      if (path === '/drive/status') return Response.json({ status: 'error', pendingCount: 5, lastSyncedAt: null, lastError: 'reauthorization_required' });
      if (path === '/notion/status') return Response.json({ status: 'synced', pendingCount: 0, lastSyncedAt: '2026-11-03T18:00:00.000Z', lastError: null });
      if (path === '/drive/sync' && init?.method === 'POST') {
        return Response.json({ drive: { status: 'error', pendingCount: 5, lastSyncedAt: null, lastError: 'reauthorization_required' } }, { status: 502 });
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
      const url = new URL(String(input)), method = init?.method ?? 'GET';
      calls.push({ path: url.pathname, method });
      if (url.pathname === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      if (url.pathname === '/sync') return Response.json({ events: [], cursor: 0, through: 0, hasMore: false });
      if (url.pathname === '/drive/status') return Response.json({ status: 'synced', pendingCount: 0, lastSyncedAt: null, lastError: null });
      if (url.pathname === '/notion/status') return Response.json({ status: 'not_configured', pendingCount: 4, lastSyncedAt: null, lastError: null });
      if (url.pathname === '/drive/sync' && method === 'POST') return Response.json({ drive: { status: 'synced', pendingCount: 0, lastSyncedAt: null, lastError: null } });
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
      const url = new URL(String(input)), method = init?.method ?? 'GET';
      if (url.pathname === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      if (url.pathname === '/sync') return Response.json({ events: [], cursor: 0, through: 0, hasMore: false });
      if (url.pathname === '/drive/status' || (url.pathname === '/drive/sync' && method === 'POST')) {
        return Response.json({ status: 'synced', pendingCount: 0, lastSyncedAt: null, lastError: null, drive: { status: 'synced', pendingCount: 0, lastSyncedAt: null, lastError: null } });
      }
      if (url.pathname === '/notion/status') return Response.json({ status: 'not_configured', pendingCount: 0, lastSyncedAt: null, lastError: null });
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

describe('owner-only read-only cloud reset preview', () => {
  const payload = {
    readOnly: true, canExecute: false, scope: 'all', matchingEvents: 3, totalEvents: 3,
    lastSeq: 3, appStateRevision: 2, protectedBankAndIdentityStateKeys: 1,
    sharedStateKeysRequiringSelectiveMerge: 1, notionPageReferencesRequiringReconciliation: 2,
    requiresCloudReconciliation: true, warning: 'Preview only.',
  };
  it('requires a Google identity token and never sends an anonymous deletion request', async () => {
    const fetcher = vi.fn(async () => Response.json(payload));
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    await expect(runtime.previewAllReset()).rejects.toThrow('Google sign-in is required');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('issues exactly one authenticated GET and displays a valid preflight', async () => {
    const fetcher = vi.fn(async () => Response.json(payload));
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    expect(await runtime.previewAllReset('owner-test-token')).toMatchObject(payload);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('https://sync.example/reset/preview?scope=all',
      expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer owner-test-token' } }));
  });
  it('rejects invalid preview payloads without claiming any deletion', async () => {
    const fetcher = vi.fn(async () => Response.json({ scope: 'all', canExecute: true }));
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher });
    await expect(runtime.previewAllReset('owner-test-token')).rejects.toThrow('پاسخ پیش‌نمایش ریست معتبر نبود');
  });
});
