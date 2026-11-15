import { runWeeklyBackup } from '../helpers/drive-mirror';
import { describe, expect, it } from 'vitest';
import { runInDurableObject } from 'cloudflare:test';
import { type LearnEvent } from '../../../shared/contracts/learn-event';
import { sha256Hex } from '../../src/drive-projection';
import { mergeWeeklyBackupContent } from '../../src/event-store';
import { OWNER_EMAIL, testEnv, makeEvent, makeMemoryDrive, appendForOwner } from '../helpers/drive-mirror';
describe('weekly backup', () => {
  it('creates a private, checksummed weekly snapshot in Math_Project/06_Backups and is idempotent for its date', async () => {
    const event = makeEvent(31, {
      type: 'check_answer',
      questionText: 'Domain?',
      userAnswer: '{1,2}',
      verdict: 'submitted',
      verdictSource: 'none',
    });
    const unclassified = makeEvent(32, {
      isTest: undefined,
      type: 'check_answer',
      questionText: 'Preview?',
      userAnswer: 'unknown',
      verdict: 'submitted',
      verdictSource: 'none',
    });
    await appendForOwner(event);
    await appendForOwner(unclassified);
    const drive = makeMemoryDrive();
    const date = new Date('2026-11-08T02:00:00.000Z');
    const first = (await runWeeklyBackup(drive.client, date)) as { status: string; lastCreatedAt: string | null; lastError: string | null };
    expect(first).toMatchObject({ status: 'created', lastCreatedAt: date.toISOString(), lastError: null });
    expect(drive.uploads.at(-1)).toMatchObject({
      name: expect.stringMatching(/^sync_backup_2026-11-08\.sha256-[a-f0-9]{64}\.json$/),
      parentId: 'backups-folder',
    });
    const backup = JSON.parse(drive.contentByName.get('sync_backup_2026-11-08.json')!) as {
      format: string;
      snapshot: { lastSeq: number; eventCount: number; quarantinedEventCount: number; progress: { lastEventId: string | null } };
      events: Array<{ seq: number; event: LearnEvent }>;
      sha256: string;
    };
    expect(backup).toMatchObject({
      format: 'math-scratchpad-weekly-backup/v1',
      snapshot: { lastSeq: 2, eventCount: 1, quarantinedEventCount: 1, progress: { lastEventId: event.id } },
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(backup.events).toEqual([{ seq: 1, event }]);
    const { sha256, ...unsigned } = backup;
    const canonical = (value: unknown): string => {
      if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
      if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
          .join(',')}}`;
      }
      return JSON.stringify(value);
    };
    expect(await sha256Hex(canonical(unsigned))).toBe(sha256);
    const uploadCount = drive.uploads.length;
    await runWeeklyBackup(drive.client, date);
    expect(drive.uploads).toHaveLength(uploadCount);
  });

  it('reuses a weekly snapshot after its upload response is lost', async () => {
    await appendForOwner(makeEvent(63, { type: 'check_answer', verdict: 'submitted', verdictSource: 'none' }));
    const drive = makeMemoryDrive({ loseBackupResponseOnce: true });
    const date = new Date('2026-11-08T02:00:00.000Z');
    const failed = (await runWeeklyBackup(drive.client, date)) as { status: string; lastError: string };
    expect(failed).toMatchObject({ status: 'error', lastError: 'network_error' });
    const firstUpload = drive.uploads.find((upload) => upload.name.startsWith('sync_backup_2026-11-08.sha256-'))!;
    const firstBytes = drive.filesById.get(firstUpload.id)!.content;

    const retried = (await runWeeklyBackup(drive.client, new Date(date.getTime() + 60_000))) as { status: string };
    const backupUploads = drive.uploads.filter((upload) => upload.name.startsWith('sync_backup_2026-11-08.sha256-'));
    expect(retried.status).toBe('created');
    expect(backupUploads).toHaveLength(1);
    expect(drive.filesById.get(firstUpload.id)!.content).toBe(firstBytes);
  });

  it('does not reintroduce unclassified events from a stale weekly backup file', () => {
    const live = makeEvent(51);
    const unclassified = makeEvent(52, { isTest: undefined });
    const remote = JSON.stringify({
      format: 'math-scratchpad-weekly-backup/v1',
      events: [{ seq: 1, event: unclassified }],
    });
    const desired = JSON.stringify({
      format: 'math-scratchpad-weekly-backup/v1',
      events: [{ seq: 2, event: live }],
    });
    expect(mergeWeeklyBackupContent(remote, desired)).toBe(desired);
  });

  it('serializes weekly backup and event mirroring that share the Drive manifest', async () => {
    await appendForOwner(makeEvent(32));
    const drive = makeMemoryDrive();
    const id = testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase());
    const stub = testEnv.EVENT_STORE.get(id);
    const date = new Date('2026-11-08T02:00:00.000Z');
    const [weekly, mirror] = await runInDurableObject(stub, async (instance) => {
      const internals = instance as unknown as {
        driveClient?: object;
        driveConfigured: () => boolean;
        syncWeeklyBackup: (now: Date) => Promise<{ status: string }>;
        syncDrive: () => Promise<{ status: string }>;
      };
      internals.driveConfigured = () => true;
      internals.driveClient = drive.client;
      return Promise.all([internals.syncWeeklyBackup(date), internals.syncDrive()]);
    });
    expect(weekly.status).toBe('created');
    expect(mirror.status).toBe('synced');
    expect(drive.uploads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: expect.stringMatching(/^sync_backup_2026-11-08\.sha256-[a-f0-9]{64}\.json$/),
          parentId: 'backups-folder',
        }),
        expect.objectContaining({ name: expect.stringMatching(/^events_2026-11\.sha256-[a-f0-9]{64}\.jsonl$/), parentId: 'events-folder' }),
        expect.objectContaining({ name: expect.stringMatching(/^sync_manifest\.sha256-[a-f0-9]{64}\.json$/), parentId: 'sync-folder' }),
      ]),
    );
  });

  it('does not let public event traffic rate-limit the owner-scoped scheduled backup', async () => {
    const id = testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase());
    const stub = testEnv.EVENT_STORE.get(id);
    const currentWindow = Math.floor(Date.now() / 60_000) * 60_000;
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec('INSERT INTO rate_windows (window_start, request_count) VALUES (?, ?)', currentWindow, 10_000);
    });
    const response = await stub.fetch(new Request('https://event-store.internal/internal/weekly-backup', { method: 'POST' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ weeklyBackup: { status: 'not_configured' } });
  });
});
