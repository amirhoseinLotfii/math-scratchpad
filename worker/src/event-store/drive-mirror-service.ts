import type { WorkerEnv } from '../env';
import { DriveMirrorError, type GoogleDriveClient, type DriveSnapshotRef } from '../google-drive';
import {
  buildProgressProjection,
  groupEventsByUtcMonth,
  formatTehran,
  mergeJsonlEventContent,
  serializeJsonlEvents,
  sha256Hex,
  type SequencedLearnEvent,
} from '../drive-projection';
import { maxSequence, readEventsThrough } from './event-repository';
import { appStateRevision as readAppStateRevision } from './state-repository';
import { DRIVE_DEBOUNCE_MS, DRIVE_RETRY_MS } from './limits';
import type { DriveMirrorState, DriveMirrorStatus } from './drive-mirror-state';

export type DriveSnapshotWrite = {
  client: GoogleDriveClient;
  state: DriveMirrorState;
  path: string;
  logicalName: string;
  parentId: string;
  mimeType: string;
  desiredContent: string;
  mergeContent: (previous: string, desired: string) => string;
  trackHash?: boolean;
};
type DriveSyncDependencies = {
  env: WorkerEnv;
  storage: DurableObjectStorage;
  getClient: () => GoogleDriveClient;
  currentClient: () => GoogleDriveClient | undefined;
  getConfiguredDriveRootId: (client: GoogleDriveClient) => Promise<string>;
  getDriveStatus: () => Promise<DriveMirrorStatus>;
  readDiagnosticStage: (destination: 'drive') => string | null;
  readDriveState: () => Promise<DriveMirrorState>;
  recordDiagnostic: (destination: 'drive', stage: string, code: string) => void;
  saveDriveState: (state: DriveMirrorState) => Promise<void>;
  scheduleAlarmIn: (delayMs: number) => Promise<void>;
  writeDriveSnapshot: (input: DriveSnapshotWrite) => Promise<DriveSnapshotRef>;
};

export async function performDriveSync(deps: DriveSyncDependencies): Promise<DriveMirrorStatus> {
  const state = await deps.readDriveState();
  const through = await maxSequence(deps.storage);
  if (!state.folders && through === 0 && readAppStateRevision(deps.storage) === 0) {
    return {
      status: 'synced',
      lastSyncedAt: null,
      pendingCount: 0,
      quarantinedCount: 0,
      lastError: null,
      failureStage: null,
      weeklyBackup: { status: 'scheduled', lastCreatedAt: null, lastError: null },
    };
  }
  if (through === state.lastSeq && state.appStateRevision === readAppStateRevision(deps.storage) && state.status === 'synced')
    return deps.getDriveStatus();
  await deps.saveDriveState({ ...state, status: 'syncing', pendingCount: Math.max(0, through - state.lastSeq), lastError: undefined });

  try {
    const client = deps.getClient();
    const events = readEventsThrough(deps.storage, through);
    const mirrorableEvents = events.filter((item) => typeof item.event.isTest === 'boolean');
    const quarantinedCount = events.length - mirrorableEvents.length;
    const newEvents = mirrorableEvents.filter((item) => item.seq > state.lastSeq);
    let folders = state.folders;
    if (!folders) {
      const rootId = await deps.getConfiguredDriveRootId(client);
      const syncId = await client.ensureFolder('03_Sync', rootId);
      const eventsId = await client.ensureFolder('events', syncId);
      const stateId = await client.ensureFolder('state', syncId);
      folders = { rootId, syncId, eventsId, stateId };
      state.folders = folders;
      await deps.saveDriveState({ ...state, status: 'syncing', folders, pendingCount: Math.max(0, through - state.lastSeq) });
    }

    const months = groupEventsByUtcMonth(newEvents);
    for (const [month, monthEvents] of months) {
      const name = `events_${month}.jsonl`;
      const path = `events/${name}`;
      const content = mergeJsonlEventContent(
        '',
        serializeJsonlEvents(
          mirrorableEvents.filter((item) => {
            const date = new Date(item.event.ts);
            return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}` === month;
          }),
        ),
      );
      await deps.writeDriveSnapshot({
        client,
        state,
        path,
        logicalName: name,
        parentId: folders.eventsId,
        mimeType: 'application/x-ndjson',
        desiredContent: content,
        mergeContent: mergeJsonlEventContent,
      });
      await deps.saveDriveState({ ...state, status: 'syncing', pendingCount: Math.max(0, through - state.lastSeq) });
    }

    const progress = buildProgressProjection(events);
    const desiredProgress = `${JSON.stringify(progress, null, 2)}\n`;
    await deps.writeDriveSnapshot({
      client,
      state,
      path: 'state/progress.json',
      logicalName: 'progress.json',
      parentId: folders.stateId,
      mimeType: 'application/json',
      desiredContent: desiredProgress,
      mergeContent: mergeProgressContent,
    });
    const stateRevision = readAppStateRevision(deps.storage);
    const persistedState = deps.storage.sql
      .exec<{ key: string; value: string | null; revision: number }>('SELECT key, value, revision FROM app_state ORDER BY key')
      .toArray();
    const stateContent =
      JSON.stringify(
        {
          format: 'math-scratchpad-server-state/v1',
          revision: stateRevision,
          records: persistedState,
        },
        null,
        2,
      ) + '\n';
    await deps.writeDriveSnapshot({
      client,
      state,
      path: 'state/editor_state.json',
      logicalName: 'editor_state.json',
      parentId: folders.stateId,
      mimeType: 'application/json',
      desiredContent: stateContent,
      mergeContent: mergeEditorStateContent,
    });

    const latest = events.at(-1);
    const now = new Date();
    const tehranTime = formatTehran(now);
    const manifest = {
      schemaVersion: 1,
      lastSeq: latest?.seq ?? 0,
      lastEventId: latest?.event.id ?? null,
      lastSuccessAtUtc: now.toISOString(),
      lastSuccessAtTehran: tehranTime,
      quarantinedEventCount: quarantinedCount,
      files: Object.entries(state.snapshots ?? {})
        .filter(([path]) => path !== 'sync_manifest.json' && !path.startsWith('backups/'))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([path, snapshot]) => ({ path, sha256: snapshot.sha256, name: snapshot.name, id: snapshot.id })),
    };
    await deps.writeDriveSnapshot({
      client,
      state,
      path: 'sync_manifest.json',
      logicalName: 'sync_manifest.json',
      parentId: folders.syncId,
      mimeType: 'application/json',
      desiredContent: `${JSON.stringify(manifest, null, 2)}\n`,
      mergeContent: mergeManifestContent,
    });

    const currentMax = await maxSequence(deps.storage);
    const pendingCount = Math.max(0, currentMax - through) + (readAppStateRevision(deps.storage) === stateRevision ? 0 : 1);
    const finalState: DriveMirrorState = {
      ...state,
      status: pendingCount === 0 ? 'synced' : 'pending',
      lastSeq: through,
      appStateRevision: stateRevision,
      pendingCount,
      quarantinedCount,
      lastSyncedAt: now.toISOString(),
      lastError: undefined,
    };
    await deps.saveDriveState(finalState);
    if (pendingCount > 0) await deps.scheduleAlarmIn(DRIVE_DEBOUNCE_MS);
    return {
      status: finalState.status,
      lastSyncedAt: finalState.lastSyncedAt ?? null,
      pendingCount: finalState.pendingCount,
      quarantinedCount: finalState.quarantinedCount ?? 0,
      lastError: null,
      failureStage: null,
      weeklyBackup: {
        status: finalState.weeklyBackup?.status ?? 'scheduled',
        lastCreatedAt: finalState.weeklyBackup?.lastCreatedAt ?? null,
        lastError: finalState.weeklyBackup?.lastError ?? null,
      },
    };
  } catch (error) {
    const code =
      error instanceof DriveMirrorError
        ? error.code
        : (error as { code?: unknown } | null)?.code === 'subrequest_budget_exceeded'
          ? 'subrequest_budget_exceeded'
          : error instanceof Error && error.message === 'event_id_conflict'
            ? 'etag_conflict'
            : 'network_error';
    const currentMax = await maxSequence(deps.storage);
    const failed: DriveMirrorState = {
      ...state,
      status: 'error',
      pendingCount: Math.max(0, currentMax - state.lastSeq),
      lastError: code,
    };
    await deps.saveDriveState(failed);
    deps.recordDiagnostic('drive', deps.currentClient()?.diagnosticStage ?? 'worker_internal', code);
    await deps.scheduleAlarmIn(DRIVE_RETRY_MS);
    return {
      status: failed.status,
      lastSyncedAt: failed.lastSyncedAt ?? null,
      pendingCount: failed.pendingCount,
      quarantinedCount: failed.quarantinedCount ?? null,
      lastError: failed.lastError ?? null,
      failureStage: deps.readDiagnosticStage('drive'),
      weeklyBackup: {
        status: failed.weeklyBackup?.status ?? 'scheduled',
        lastCreatedAt: failed.weeklyBackup?.lastCreatedAt ?? null,
        lastError: failed.weeklyBackup?.lastError ?? null,
      },
    };
  }
}

function mergeProgressContent(remote: string, desired: string): string {
  const previous = parseJsonContent(remote);
  const current = parseJsonContent(desired);
  if (Number(previous.lastSeq ?? 0) > Number(current.lastSeq ?? 0)) throw new DriveMirrorError('etag_conflict');
  return desired;
}

function mergeManifestContent(remote: string, desired: string): string {
  const previous = parseJsonContent(remote);
  const current = parseJsonContent(desired);
  if (Number(previous.lastSeq ?? 0) > Number(current.lastSeq ?? 0)) throw new DriveMirrorError('etag_conflict');
  return desired;
}

function mergeEditorStateContent(remote: string, desired: string): string {
  const previous = parseJsonContent(remote);
  const current = parseJsonContent(desired);
  if (
    previous.format !== 'math-scratchpad-server-state/v1' ||
    current.format !== 'math-scratchpad-server-state/v1' ||
    !Number.isSafeInteger(previous.revision) ||
    !Number.isSafeInteger(current.revision) ||
    !Array.isArray(previous.records) ||
    !Array.isArray(current.records)
  ) {
    throw new DriveMirrorError('invalid_response');
  }
  if (Number(previous.revision) > Number(current.revision)) throw new DriveMirrorError('etag_conflict');
  return desired;
}

function parseJsonContent(content: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(content);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new DriveMirrorError('invalid_response');
  }
}
