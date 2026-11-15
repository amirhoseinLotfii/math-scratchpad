import { readDiagnosticStage } from './mirror-diagnostics';
import { appStateRevision as readAppStateRevision } from './state-repository';
import { maxSequence } from './event-repository';
import type { WorkerEnv } from '../env';
import { DriveMirrorError, type GoogleDriveClient } from '../google-drive';
import type { DriveMirrorState, DriveMirrorStatus } from './drive-mirror-state';
import { DRIVE_STATE_KEY } from './limits';

export function driveConfigured(env: WorkerEnv): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET && env.GOOGLE_DRIVE_REFRESH_TOKEN);
}

export async function getConfiguredDriveRootId(env: WorkerEnv, client: GoogleDriveClient): Promise<string> {
  const rootId = env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim();
  const rootName = env.GOOGLE_DRIVE_ROOT_FOLDER_NAME?.trim() || 'Math_Project';
  if (!rootId) return client.ensureRootFolder(rootName);
  const root = await client.readFileMetadata(rootId, 'id,name,mimeType,parents,trashed');
  if (root.id !== rootId || root.name !== rootName || root.mimeType !== 'application/vnd.google-apps.folder' || root.trashed === true) {
    throw new DriveMirrorError('invalid_response');
  }
  return rootId;
}

export async function readDriveState(storage: DurableObjectStorage): Promise<DriveMirrorState> {
  const stored = await storage.get<DriveMirrorState>(DRIVE_STATE_KEY);
  return stored
    ? { ...stored, files: stored.files ?? {}, fileHashes: stored.fileHashes ?? {}, snapshots: stored.snapshots ?? {} }
    : { status: 'pending', lastSeq: 0, pendingCount: 0, quarantinedCount: undefined, files: {}, fileHashes: {}, snapshots: {} };
}

export async function saveDriveState(storage: DurableObjectStorage, state: DriveMirrorState): Promise<void> {
  await storage.put(DRIVE_STATE_KEY, state);
  storage.sql.exec(
    'INSERT INTO sync_health (destination, status, pending_count, last_error, last_synced_at, ' +
      'updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(destination) DO UPDATE SET ' +
      'status=excluded.status, pending_count=excluded.pending_count, ' +
      'last_error=excluded.last_error, last_synced_at=excluded.last_synced_at, ' +
      'updated_at=excluded.updated_at',
    'drive',
    state.status,
    state.pendingCount,
    state.lastError ?? null,
    state.lastSyncedAt ?? null,
    new Date().toISOString(),
  );
}

export async function getDriveStatus(storage: DurableObjectStorage, configured: boolean): Promise<DriveMirrorStatus> {
  const maxSeq = await maxSequence(storage);
  if (!configured) {
    return {
      status: 'not_configured',
      lastSyncedAt: null,
      pendingCount: maxSeq,
      quarantinedCount: null,
      lastError: null,
      failureStage: null,
      weeklyBackup: { status: 'not_configured', lastCreatedAt: null, lastError: null },
    };
  }
  const state = await readDriveState(storage);
  return {
    status: state.status,
    lastSyncedAt: state.lastSyncedAt ?? null,
    pendingCount: Math.max(0, maxSeq - state.lastSeq) + (state.appStateRevision === readAppStateRevision(storage) ? 0 : 1),
    quarantinedCount: state.quarantinedCount ?? null,
    lastError: state.lastError ?? null,
    failureStage: state.status === 'error' ? readDiagnosticStage(storage, 'drive') : null,
    weeklyBackup: {
      status: state.weeklyBackup?.status ?? 'scheduled',
      lastCreatedAt: state.weeklyBackup?.lastCreatedAt ?? null,
      lastError: state.weeklyBackup?.lastError ?? null,
    },
  };
}
