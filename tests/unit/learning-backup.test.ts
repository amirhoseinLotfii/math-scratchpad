import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  getLearningDb,
  initializeLearningStorage,
  queueLearnEvent,
  readOutboxCount,
  resetLearningDbForTests,
  setSyncMeta,
  storeServerEvents,
  writeLearningItem,
} from '../../src/sync/browser-db';
import { createFullLearningBackup, importFullLearningBackup, parseFullLearningBackup, previewFullLearningBackup } from '../../src/sync/learning-backup';
import type { LearnEvent } from '../../src/sync/events';
import { initialState } from '../../src/store';

function event(id = '00000000-0000-4000-8000-000000000001', userAnswer?: string): LearnEvent {
  return {
    id, schema: 1, ts: '2026-11-02T00:00:00.000Z', deviceId: '11111111-1111-4111-8111-111111111111',
    bankVersion: 'v21', session: 'backup-test', chapter: 1, lesson: '1.1', section: '1.1-a', concept: 'relations',
    type: 'check_answer', itemId: 'q-1', ...(userAnswer === undefined ? {} : { userAnswer }), verdict: 'submitted', verdictSource: 'none',
  };
}

function progress(value: string) {
  return JSON.stringify({ schemaVersion: 1, bankId: 'bank-1', bankVersion: 'v21', lessons: {}, lessonPanelEvents: [], note: value });
}

async function records() {
  const db = await getLearningDb();
  return {
    cache: await db.getAll('cache'), outbox: await db.getAll('outbox'),
    serverEvents: await db.getAll('serverEvents'), meta: await db.getAll('meta'),
  };
}

beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto as unknown as Crypto);
  localStorage.clear();
  await resetLearningDbForTests();
  await initializeLearningStorage();
});

afterEach(async () => {
  await resetLearningDbForTests();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('full learning backup', () => {
  it('exports, wipes, validates, and restores the exact cache, outbox, server events, and metadata', async () => {
    await writeLearningItem('math-scratchpad-lesson-progress-v1:bank-1:v21', progress('progress'));
    const session = initialState();
    await writeLearningItem('math-scratchpad-session-v3', JSON.stringify({
      version: 3,
      state: { session: { doc: session.doc, prefs: session.prefs, keyboardOpen: session.keyboardOpen }, sync: { revision: 1, writerId: 'backup-test' } },
    }));
    const queued = event('00000000-0000-4000-8000-000000000002', '{1,2}');
    const stored = event('00000000-0000-4000-8000-000000000003', '{3,4}');
    await queueLearnEvent(queued);
    await storeServerEvents([{ seq: 8, event: stored }]);
    await setSyncMeta('server-cursor', 8);
    await setSyncMeta('snapshot-initialized', true);
    const before = await records();

    const text = await createFullLearningBackup(new Date('2026-11-02T01:00:00.000Z'));
    const parsed = await parseFullLearningBackup(text);
    expect(parsed.stores).toMatchObject({ cache: expect.any(Array), outbox: expect.any(Array), serverEvents: expect.any(Array), meta: expect.any(Array) });

    await resetLearningDbForTests();
    localStorage.clear();
    await initializeLearningStorage();
    const preview = await previewFullLearningBackup(parsed);
    expect(preview.canImport).toBe(true);
    expect(preview.additions).toEqual({ cache: before.cache.length, outbox: 1, serverEvents: 1, meta: 2 });
    const result = await importFullLearningBackup(parsed);
    expect(result.addedCacheKeys).toContain('math-scratchpad-lesson-progress-v1:bank-1:v21');
    expect(await records()).toEqual(before);
  });

  it('rejects content tampering before exposing an import preview', async () => {
    const queued = event('00000000-0000-4000-8000-000000000004', 'answer');
    await queueLearnEvent(queued);
    const backup = JSON.parse(await createFullLearningBackup()) as { stores: { outbox: Array<{ event: LearnEvent }> } };
    backup.stores.outbox[0].event.userAnswer = 'tampered';
    await expect(parseFullLearningBackup(JSON.stringify(backup))).rejects.toThrow(/هش پشتیبان/);
    await expect(parseFullLearningBackup('{broken')).rejects.toThrow(/JSON معتبر/);

    const malformed = JSON.parse(await createFullLearningBackup()) as typeof backup;
    malformed.stores.outbox[0].event.id = 'not-a-uuid';
    await expect(parseFullLearningBackup(JSON.stringify(malformed))).rejects.toThrow(/ساختار پشتیبان/);
  });

  it('shows and preserves local cache conflicts while adding nonconflicting data', async () => {
    await writeLearningItem('math-scratchpad-lesson-progress-v1:bank-1:v21', progress('from-backup'));
    await queueLearnEvent(event('00000000-0000-4000-8000-000000000005', 'backup-answer'));
    const backup = await parseFullLearningBackup(await createFullLearningBackup());

    await resetLearningDbForTests();
    await initializeLearningStorage();
    await writeLearningItem('math-scratchpad-lesson-progress-v1:bank-1:v21', progress('local-newer'));
    const preview = await previewFullLearningBackup(backup);
    expect(preview).toMatchObject({ canImport: true, preservedConflicts: { cache: 1 }, additions: { outbox: 1 } });
    await importFullLearningBackup(backup);
    await expect((await getLearningDb()).get('cache', 'math-scratchpad-lesson-progress-v1:bank-1:v21')).resolves.toMatchObject({ value: progress('local-newer') });
    expect(await readOutboxCount()).toBe(1);
  });

  it('blocks a reused event ID with changed content without changing the local database', async () => {
    await queueLearnEvent(event('00000000-0000-4000-8000-000000000006', 'backup-answer'));
    const backup = await parseFullLearningBackup(await createFullLearningBackup());

    await resetLearningDbForTests();
    await initializeLearningStorage();
    await queueLearnEvent(event('00000000-0000-4000-8000-000000000006', 'newer-local-answer'));
    const before = await records();
    const preview = await previewFullLearningBackup(backup);
    expect(preview.canImport).toBe(false);
    expect(preview.blockingConflicts).toHaveLength(1);
    await expect(importFullLearningBackup(backup)).rejects.toThrow(/ناسازگار است/);
    expect(await records()).toEqual(before);
  });

  it('merges events by stable ID and removes an already-acknowledged queued duplicate', async () => {
    const acknowledged = event('00000000-0000-4000-8000-000000000007', 'same');
    await queueLearnEvent(acknowledged);
    await storeServerEvents([{ seq: 1, event: acknowledged }]);
    const consistent = await parseFullLearningBackup(await createFullLearningBackup());

    await resetLearningDbForTests();
    await initializeLearningStorage();
    await queueLearnEvent(acknowledged);
    const preview = await previewFullLearningBackup(consistent);
    expect(preview.alreadyPresent.outbox).toBe(1);
    await importFullLearningBackup(consistent);
    expect(await readOutboxCount()).toBe(0);
    expect(await (await getLearningDb()).getAll('serverEvents')).toEqual([{ seq: 1, event: acknowledged }]);
  });

  it('does not overwrite a local server sequence that belongs to another event', async () => {
    const source = event('00000000-0000-4000-8000-000000000008', 'source');
    await storeServerEvents([{ seq: 3, event: source }]);
    const backup = await parseFullLearningBackup(await createFullLearningBackup());

    await resetLearningDbForTests();
    await initializeLearningStorage();
    const local = event('00000000-0000-4000-8000-000000000009', 'local');
    await storeServerEvents([{ seq: 3, event: local }]);
    const before = await records();
    const preview = await previewFullLearningBackup(backup);
    expect(preview.canImport).toBe(false);
    await expect(importFullLearningBackup(backup)).rejects.toThrow(/ناسازگار است/);
    expect(await records()).toEqual(before);
  });
});
