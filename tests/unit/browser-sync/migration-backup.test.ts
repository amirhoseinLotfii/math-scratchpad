import { describe, expect, it, vi } from 'vitest';
import {
  clearVerifiedLegacyKeys,
  initializeLearningStorage,
  readLegacyMigration,
  writeLegacyMigration,
  type LegacyMigration,
} from '../../../src/sync/browser-db';
import {
  backupAndFinishLegacyMigration,
  finishLegacyMigration,
  markLegacyMigrationDriveVerified,
  queueLegacyMigration,
} from '../../../src/sync/legacy-migration';
import { SESSION_KEY, LESSON_KEY, OLD_SESSION, OLD_LESSON, seedLegacy } from '../../helpers/browser-sync';
describe('migration backup', () => {
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
      await new Promise((resolve) => setTimeout(resolve, 30));
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
    await expect(
      backupAndFinishLegacyMigration(verified.id, async () => {
        throw new Error('Drive upload failed');
      }),
    ).rejects.toThrow('Drive upload failed');
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
    await expect(
      markLegacyMigrationDriveVerified({ ...verified, id: 'different-id' }, { id: 'backup-id', name: 'backup.json' }),
    ).rejects.toThrow(/changed in another tab/i);
    expect((await readLegacyMigration())?.status).toBe('server-verified');
  });

  it('refuses to record a Drive backup when the saved migration manifest changed', async () => {
    seedLegacy();
    await initializeLearningStorage();
    const queued = await queueLegacyMigration();
    const verified = { ...queued!, status: 'server-verified' as const, serverVerifiedAt: '2026-11-03T06:00:00.000Z' };
    await writeLegacyMigration({ ...verified, entries: [...verified.entries, { key: 'unexpected', value: 'new', sha256: '' }] });
    await expect(markLegacyMigrationDriveVerified(verified, { id: 'backup-id', name: 'backup.json' })).rejects.toThrow(/snapshot changed/i);
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
});
