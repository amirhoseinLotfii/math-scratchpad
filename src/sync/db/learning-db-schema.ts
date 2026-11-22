import type { DBSchema } from 'idb';
import { ARCHIVE_KEY, BANK_CACHE_PREFIX, LESSON_PROGRESS_PREFIX } from '../../shared/lib/storage-keys';
import type { LearnEvent } from '../events';
import { LEARNING_RESET_EPOCH } from '../learning-reset-epoch';

export const LEARNING_DB_NAME = 'math-scratchpad-sync-v2';
export const LEARNING_DB_VERSION = 2;
export const LEGACY_LEARNING_DB_NAMES = ['math-scratchpad-sync-v1'] as const;
export const LEARNING_CACHE_STORE = 'cache';
export const LEARNING_OUTBOX_STORE = 'outbox';
export const LEARNING_SERVER_EVENTS_STORE = 'serverEvents';
export const LEARNING_META_STORE = 'meta';
export const LEARNING_QUARANTINE_STORE = 'quarantine';
export const LEGACY_MIGRATION_META_KEY = 'legacy-migration-v1';
export const LOCAL_RESET_EPOCH_KEY = 'math-scratchpad-local-learning-reset-epoch-v1';
export const LOCAL_RESET_EPOCH = LEARNING_RESET_EPOCH;
export const LEGACY_MIGRATION_LOCK_NAME = 'math-scratchpad-legacy-migration-v1';
export const LEGACY_MIGRATION_LOCK_KEY = 'legacy-migration-lock-v1';
export const LEGACY_MIGRATION_LOCK_LEASE_MS = 120_000;
export const LEGACY_MIGRATION_LOCK_TIMEOUT_MS = 15_000;

export type OutboxRecord = { id: string; event: LearnEvent; queuedAt: string; creationEpoch?: string; migrationId?: string };
export type QuarantinedOutboxRecord = OutboxRecord & {
  quarantineId: string;
  quarantinedAt: string;
  requiredEpoch: string;
  reason: 'stale_epoch';
};
export type ServerEventRecord = { seq: number; event: LearnEvent };
export type LegacyLearningEntry = { key: string; value: string; sha256: string };
export type LegacyMigration = {
  id: string;
  createdAt: string;
  entries: LegacyLearningEntry[];
  eventIds: string[];
  status: 'pending' | 'server-verified' | 'drive-backed-up' | 'complete';
  serverVerifiedAt?: string;
  backupFileId?: string;
  backupFileName?: string;
  backupVerifiedAt?: string;
};
export type MetaRecord = { key: string; value: unknown };
export type CacheRecord = { key: string; value: string; updatedAt: string };

export interface LearningDb extends DBSchema {
  cache: { key: string; value: CacheRecord };
  outbox: {
    key: string;
    value: OutboxRecord;
    indexes: { 'by-queued-at': string; 'by-migration-id': string };
  };
  serverEvents: {
    key: number;
    value: ServerEventRecord;
    indexes: { 'by-event-id': string; 'by-migration-id': string };
  };
  quarantine: { key: string; value: QuarantinedOutboxRecord };
  meta: { key: string; value: MetaRecord };
}

export type LearningStorageBootstrap = {
  storage: Storage;
  dbAvailable: boolean;
  migration: LegacyMigration | null;
  warning: string;
};

const SESSION_KEYS = new Set([
  'math-scratchpad-session-v3',
  'math-scratchpad-redux-v2',
  'math-scratchpad-flow-v1',
  ARCHIVE_KEY,
  'math-scratchpad-inline-fractions-round1-v1',
  'math-scratchpad-reading-position-v1',
]);
const DEVICE_ID_KEY = 'math-scratchpad-device-id-v1';

export function isLearningStorageKey(key: string): boolean {
  return SESSION_KEYS.has(key)
    || key.startsWith(`${LESSON_PROGRESS_PREFIX}:`)
    || key.startsWith('math-scratchpad-last-open-lesson-v1:')
    || key.startsWith('math-scratchpad-reading-position-v1:');
}

export function isIndexedDbCacheKey(key: string): boolean {
  return isLearningStorageKey(key) || key === DEVICE_ID_KEY || key.startsWith(`${BANK_CACHE_PREFIX}:`);
}

export function localStorageIfAvailable(): Storage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}
