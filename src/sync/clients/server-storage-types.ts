export type ServerStateRecord = { key: string; value: string | null; revision: number; updatedAt?: string };
export type ServerSnapshot = { records: ServerStateRecord[]; revision: number };

export const SERVER_STORAGE_CONFLICT_EVENT = 'math-scratchpad:server-conflict';
export const SERVER_STORAGE_SNAPSHOT_REQUEST_EVENT = 'math-scratchpad:server-snapshot-request';

export type ServerStorageConflict = {
  key: string;
  localValue: string | null;
  remoteValue: string | null;
  remoteRevision: number;
};
export type ServerStorageConflictChoice = 'local' | 'remote';
export type ServerStorageChangeSource = 'server-merge' | 'server-resolution-local' | 'server-resolution-remote';
export type ServerStorageSnapshotRequest = { key: string; value: string | null; provided: boolean };
