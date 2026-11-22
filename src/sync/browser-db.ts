export {
  LEARNING_CACHE_STORE,
  LEARNING_DB_NAME,
  LEARNING_DB_VERSION,
  LEARNING_META_STORE,
  LEARNING_OUTBOX_STORE,
  LEARNING_QUARANTINE_STORE,
  LEARNING_SERVER_EVENTS_STORE,
  LEGACY_MIGRATION_META_KEY,
  isLearningStorageKey,
  type CacheRecord,
  type LearningStorageBootstrap,
  type LegacyLearningEntry,
  type LegacyMigration,
  type MetaRecord,
  type OutboxRecord,
  type QuarantinedOutboxRecord,
  type ServerEventRecord,
} from './db/learning-db-schema';
export { getLearningDb, withLegacyMigrationLock } from './db/learning-db-connection';
export {
  completeLocalLearningReset,
  isLocalLearningResetPending,
  prepareLocalLearningReset,
  reconcileServerLearningResetEpoch,
} from './db/learning-reset-reconciler';
export {
  acknowledgeOutbox,
  getSyncMeta,
  memoryOutboxRecords,
  memoryServerEventRecords,
  queueLearnEvent,
  readOutboxBatch,
  readOutboxCount,
  readQuarantineCount,
  readServerEventsByMigration,
  setSyncMeta,
  storeServerEvents,
} from './db/learning-outbox-store';
export {
  flushLearningStorage,
  getLearningStorage,
  initializeLearningStorage,
  learningDbWriteError,
  refreshLearningStorageValues,
  subscribeLearningStorage,
  writeLearningItem,
} from './db/learning-storage-facade';
export {
  getAuthenticatedServerStorage,
  initializeAuthenticatedServerStorage,
  isServerStorageActive,
  refreshAuthenticatedServerStorage,
  serverLearningStateRecords,
  updateAuthenticatedServerToken,
} from './db/server-storage-bridge';
export {
  clearLegacyBrowserLearningData,
  clearVerifiedLegacyKeys,
  readLegacyMigration,
  resetLearningDbForTests,
  writeLegacyMigration,
} from './db/legacy-storage-cleanup';
