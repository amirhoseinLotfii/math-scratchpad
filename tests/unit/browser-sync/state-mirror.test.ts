import { describe, expect, it, vi } from 'vitest';
import { actions, initialState } from '../../../src/store';
import { createPersistentStore } from '../../../src/features/session/persistence/persistent-store';
import {
  getAuthenticatedServerStorage,
  getLearningDb,
  getLearningStorage,
  initializeLearningStorage,
  initializeAuthenticatedServerStorage,
  flushLearningStorage,
  writeLearningItem,
} from '../../../src/sync/browser-db';
import { SESSION_KEY, LESSON_KEY } from '../../helpers/browser-sync';
describe('state mirror', () => {
  it('keeps large Drive bank caches local and mirrors only durable learner state', async () => {
    const writes: Array<{ key: string; value: string | null; revision: number }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { key: string; value: string | null; revision: number };
          writes.push(body);
          return Response.json({ key: body.key, revision: body.revision + 1, updatedAt: new Date().toISOString() });
        }
        return Response.json({ records: [], revision: 0 });
      }),
    );
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
    expect(writes.map((write) => write.key)).toEqual([SESSION_KEY]);
  });

  it('uses a newer server learner record to restore the local copy after another device updated it', async () => {
    const remoteValue = '{"draft":"newer server copy"}';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string) =>
        Response.json({
          revision: 5,
          records: [{ key: SESSION_KEY, value: remoteValue, revision: 4, updatedAt: '2099-01-01T00:00:00.000Z' }],
        }),
      ),
    );
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          writes.push(JSON.parse(String(init.body)));
          return Response.json({ key: LESSON_KEY, revision: 8, updatedAt: '2026-11-11T00:00:00.000Z' });
        }
        return Response.json({
          revision: 7,
          records: [{ key: LESSON_KEY, value: remoteValue, revision: 7, updatedAt: '2026-11-10T00:00:00.000Z' }],
        });
      }),
    );

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
    const initialValue = JSON.stringify({
      version: 3,
      state: {
        session: { doc: initial.doc, prefs: initial.prefs, keyboardOpen: false },
        sync: { revision: 1, writerId: 'seed-device' },
      },
    });
    localStorage.setItem(SESSION_KEY, initialValue);
    let serverRecord = { key: SESSION_KEY, value: initialValue, revision: 1 };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { key: string; value: string | null; revision: number };
          if (body.revision !== serverRecord.revision)
            return Response.json({ error: 'state_conflict', revision: serverRecord.revision }, { status: 409 });
          serverRecord = { key: body.key, value: body.value ?? '', revision: body.revision + 1 };
          return Response.json({ key: body.key, revision: serverRecord.revision });
        }
        return Response.json({ revision: serverRecord.revision, records: [serverRecord] });
      }),
    );

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
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') return Response.json({ error: 'payload_too_large' }, { status: 413 });
        return Response.json({ records: [], revision: 0 });
      }),
    );
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          writes.push(JSON.parse(String(init.body)));
          return Response.json({ revision: 1 });
        }
        return Response.json({ records: [], revision: 0 });
      }),
    );
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
});
