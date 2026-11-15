import type { LearnEvent } from '../../../shared/contracts/learn-event';
import type { WorkerEnv } from '../env';
import { DriveMirrorError, type GoogleDriveClient } from '../google-drive';
import { buildProgressProjection, formatTehran, sha256Hex } from '../drive-projection';
import { canonicalJson } from './canonical-json';
import { readEventsThrough, maxSequence } from './event-repository';
import { appStateRevision as readAppStateRevision } from './state-repository';
import { getConfiguredDriveRootId, readDriveState, saveDriveState } from './drive-mirror-repository';
import { writeDriveSnapshot } from './drive-snapshot-repository';
import type { DriveMirrorStatus } from './drive-mirror-state';
import { WEEKLY_BACKUP_RETRY_MS } from './limits';

type WeeklyBackupDependencies = {
  env: WorkerEnv;
  storage: DurableObjectStorage;
  configured: () => boolean;
  getClient: () => GoogleDriveClient;
  scheduleAlarmIn: (delay: number) => Promise<void>;
};

export function mergeWeeklyBackupContent(remote: string, desired: string): string {
  let current: unknown, next: unknown;
  try {
    current = JSON.parse(remote);
    next = JSON.parse(desired);
  } catch {
    throw new Error('event_id_conflict');
  }
  if (
    !current ||
    typeof current !== 'object' ||
    !next ||
    typeof next !== 'object' ||
    (current as { format?: unknown }).format !== 'math-scratchpad-weekly-backup/v1' ||
    (next as { format?: unknown }).format !== 'math-scratchpad-weekly-backup/v1' ||
    !Array.isArray((current as { events?: unknown }).events) ||
    !Array.isArray((next as { events?: unknown }).events)
  ) {
    throw new Error('event_id_conflict');
  }
  const latestEvents = (next as { events: Array<{ seq: number; event: LearnEvent }> }).events.filter(
    (item) => typeof item.event?.isTest === 'boolean',
  );
  const previousMirrorableEvents = (current as { events: Array<{ seq: number; event: LearnEvent }> }).events.filter(
    (item) => typeof item.event?.isTest === 'boolean',
  );
  const latest = new Map(latestEvents.map((item) => [item.event.id, canonicalJson(item)]));
  for (const item of previousMirrorableEvents) {
    if (!latest.has(item.event.id) || latest.get(item.event.id) !== canonicalJson(item)) {
      throw new Error('event_id_conflict');
    }
  }
  return desired;
}

export async function performWeeklyBackup(deps: WeeklyBackupDependencies, now: Date): Promise<DriveMirrorStatus['weeklyBackup']> {
  if (!deps.configured()) return { status: 'not_configured', lastCreatedAt: null, lastError: null };
  const state = await readDriveState(deps.storage);
  if (!state.folders && (await maxSequence(deps.storage)) === 0 && readAppStateRevision(deps.storage) === 0) {
    return { status: 'scheduled', lastCreatedAt: null, lastError: null };
  }
  const date = formatTehran(now).slice(0, 10);
  if (state.weeklyBackup?.status === 'created' && state.weeklyBackup.date === date) {
    return { status: 'created', lastCreatedAt: state.weeklyBackup.lastCreatedAt ?? null, lastError: null };
  }

  try {
    const client = deps.getClient();
    let folders = state.folders;
    if (!folders) {
      const rootId = await getConfiguredDriveRootId(deps.env, client);
      const syncId = await client.ensureFolder('03_Sync', rootId);
      const eventsId = await client.ensureFolder('events', syncId);
      const stateId = await client.ensureFolder('state', syncId);
      folders = { rootId, syncId, eventsId, stateId };
    }
    const backupsId = folders.backupsId ?? (await client.ensureFolder('06_Backups', folders.rootId));
    folders = { ...folders, backupsId };
    state.folders = folders;
    await saveDriveState(deps.storage, { ...state, status: state.status, folders });

    const through = await maxSequence(deps.storage);
    const events = readEventsThrough(deps.storage, through);
    const mirrorableEvents = events.filter((item) => typeof item.event.isTest === 'boolean');
    const quarantinedCount = events.length - mirrorableEvents.length;
    const snapshotCreatedAtUtc =
      state.weeklyBackup?.date === date && state.weeklyBackup.snapshotCreatedAtUtc
        ? state.weeklyBackup.snapshotCreatedAtUtc
        : now.toISOString();
    state.weeklyBackup = { ...state.weeklyBackup, status: 'scheduled', date, snapshotCreatedAtUtc };
    await saveDriveState(deps.storage, { ...state, status: state.status, weeklyBackup: state.weeklyBackup });
    const snapshotCreatedAt = new Date(snapshotCreatedAtUtc);
    const unsigned = {
      format: 'math-scratchpad-weekly-backup/v1',
      schemaVersion: 1,
      backupDateTehran: date,
      createdAtUtc: snapshotCreatedAt.toISOString(),
      createdAtTehran: formatTehran(snapshotCreatedAt),
      snapshot: {
        lastSeq: through,
        eventCount: mirrorableEvents.length,
        quarantinedEventCount: quarantinedCount,
        progress: buildProgressProjection(mirrorableEvents, snapshotCreatedAt),
      },
      events: mirrorableEvents,
    };
    const contents = `${JSON.stringify({ ...unsigned, sha256: await sha256Hex(canonicalJson(unsigned)) }, null, 2)}\n`;
    const name = `sync_backup_${date}.json`;
    const path = `backups/${name}`;
    await writeDriveSnapshot({
      client,
      state,
      path,
      logicalName: name,
      parentId: backupsId,
      mimeType: 'application/json',
      desiredContent: contents,
      mergeContent: mergeWeeklyBackupContent,
      trackHash: false,
    });
    state.weeklyBackup = {
      ...state.weeklyBackup,
      status: 'created',
      date,
      snapshotCreatedAtUtc,
      lastCreatedAt: now.toISOString(),
      lastSeq: through,
    };
    await saveDriveState(deps.storage, { ...state, status: state.status, weeklyBackup: state.weeklyBackup });
    return { status: 'created', lastCreatedAt: now.toISOString(), lastError: null };
  } catch (error) {
    const code =
      error instanceof DriveMirrorError
        ? error.code
        : (error as { code?: unknown } | null)?.code === 'subrequest_budget_exceeded'
          ? 'subrequest_budget_exceeded'
          : error instanceof Error && error.message === 'event_id_conflict'
            ? 'etag_conflict'
            : 'network_error';
    state.weeklyBackup = { ...state.weeklyBackup, status: 'error', date, lastError: code };
    await saveDriveState(deps.storage, { ...state, status: state.status, weeklyBackup: state.weeklyBackup });
    await deps.scheduleAlarmIn(WEEKLY_BACKUP_RETRY_MS);
    return { status: 'error', lastCreatedAt: state.weeklyBackup.lastCreatedAt ?? null, lastError: code };
  }
}
