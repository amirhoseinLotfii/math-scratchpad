/**
 * Authenticated server mirror for learner state.
 *
 * IndexedDB remains the durable local source. This adapter mirrors allowlisted
 * learning records through the authenticated Worker endpoint.
 */
export {
  SERVER_STORAGE_CONFLICT_EVENT,
  SERVER_STORAGE_SNAPSHOT_REQUEST_EVENT,
  type ServerStateRecord,
  type ServerStorageChangeSource,
  type ServerStorageConflict,
  type ServerStorageConflictChoice,
  type ServerStorageSnapshotRequest,
} from './clients/server-storage-types';
export { readServerSnapshot, verifyOwnerServerConnection } from './clients/server-snapshot-client';
export { ServerBackedStorage } from './clients/server-backed-storage';
