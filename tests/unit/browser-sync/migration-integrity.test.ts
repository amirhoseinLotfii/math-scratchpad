import { describe, expect, it, vi } from 'vitest';
import {
  clearVerifiedLegacyKeys,
  getLearningDb,
  initializeLearningStorage,
  readLegacyMigration,
  readOutboxCount,
  storeServerEvents,
  withLegacyMigrationLock,
  writeLegacyMigration,
} from '../../../src/sync/browser-db';
import {
  backupAndFinishLegacyMigration,
  finishLegacyMigration,
  legacyMigrationBackupContents,
  markLegacyMigrationDriveVerified,
  queueLegacyMigration,
  verifyLegacyMigrationOnServer,
} from '../../../src/sync/legacy-migration';
import { SESSION_KEY, LESSON_KEY, OLD_SESSION, OLD_LESSON, seedLegacy } from '../../helpers/browser-sync';
describe('migration integrity', () => {
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
    expect(verified.entries.map((entry) => entry.sha256)).toEqual(expect.arrayContaining([expect.stringMatching(/^[a-f0-9]{64}$/)]));
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

  it('serializes concurrent migration lock holders instead of running in parallel', async () => {
    let active = 0;
    let maximumActive = 0;
    const hold = () =>
      withLegacyMigrationLock(async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 25));
        active -= 1;
      });
    await Promise.all([hold(), hold()]);
    expect(maximumActive).toBe(1);
  });

  it('shares one legacy snapshot between independent tab module instances', async () => {
    seedLegacy();
    const firstTab = await import('../../../src/sync/browser-db');
    vi.resetModules();
    const secondTab = await import('../../../src/sync/browser-db');
    const [first, second] = await Promise.all([firstTab.initializeLearningStorage(), secondTab.initializeLearningStorage()]);
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
});
