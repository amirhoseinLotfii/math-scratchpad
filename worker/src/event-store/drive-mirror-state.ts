import type { DriveFileRef, DriveMirrorErrorCode, DriveSnapshotRef } from '../google-drive';

export type DriveMirrorState = {
  status: 'pending' | 'syncing' | 'synced' | 'error';
  lastSeq: number;
  appStateRevision?: number;
  pendingCount: number;
  quarantinedCount?: number;
  lastSyncedAt?: string;
  lastError?: DriveMirrorErrorCode;
  folders?: { rootId: string; syncId: string; eventsId: string; stateId: string; backupsId?: string };
  weeklyBackup?: {
    status: 'scheduled' | 'created' | 'error';
    date?: string;
    snapshotCreatedAtUtc?: string;
    lastCreatedAt?: string;
    lastSeq?: number;
    lastError?: DriveMirrorErrorCode;
  };
  files: Record<string, DriveFileRef>;
  fileHashes: Record<string, string>;
  snapshots?: Record<string, DriveSnapshotRef>;
};
export type DriveMirrorStatus = {
  status: 'not_configured' | 'pending' | 'syncing' | 'synced' | 'error';
  lastSyncedAt: string | null;
  pendingCount: number;
  quarantinedCount: number | null;
  lastError: DriveMirrorErrorCode | null;
  /** Sanitized Drive client stage, only reported while the mirror is in error. */
  failureStage?: string | null;
  weeklyBackup: {
    status: 'not_configured' | 'scheduled' | 'created' | 'error';
    lastCreatedAt: string | null;
    lastError: DriveMirrorErrorCode | null;
  };
};
