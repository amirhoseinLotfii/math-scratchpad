import type { LearnEvent } from '../events';

export const PAGE_LIMIT = 100;
export const MAX_PULL_PAGES_PER_RUN = 100;
export const MAX_BATCH_BYTES = 190_000;
export const MAX_BATCH_EVENTS = 50;
export const MAX_KEEPALIVE_BATCH_BYTES = 60_000;
export const EVENT_DEBOUNCE_MS = 5_000;
export const EVENT_MAX_WAIT_MS = 30_000;

export type SyncPhase = 'idle' | 'needs-auth' | 'queued' | 'syncing' | 'synced' | 'retrying' | 'error';
export type MirrorPhase = 'not_configured' | 'pending' | 'syncing' | 'synced' | 'error';
export type MirrorSyncStatus = {
  status: MirrorPhase;
  pendingCount: number;
  quarantinedCount?: number | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  weeklyBackup?: {
    status: 'not_configured' | 'scheduled' | 'created' | 'error';
    lastCreatedAt: string | null;
    lastError: string | null;
  };
};
export type SyncStatus = {
  phase: SyncPhase;
  pending: number;
  quarantined: number;
  lastSyncedAt?: string;
  lastError?: string;
  driveMirror: MirrorSyncStatus | null;
  notionMirror: MirrorSyncStatus | null;
};

export type ResetPreview = {
  readOnly: true; canExecute: false; scope: 'all';
  matchingEvents: number; totalEvents: number; lastSeq: number; appStateRevision: number;
  protectedBankAndIdentityStateKeys: number; sharedStateKeysRequiringSelectiveMerge: number;
  notionPageReferencesRequiringReconciliation: number | null;
  requiresCloudReconciliation: true; warning: string;
};

export type SyncPage = { events: Array<{ seq: number; event: LearnEvent }>; cursor: number; through: number; hasMore: boolean; snapshotCursor?: number };
export type AckResponse = { events: Array<{ id: string; seq: number; duplicate: boolean }>; cursor: number };
export type RuntimeOptions = {
  apiOrigin?: string;
  fetcher?: typeof fetch;
  random?: () => number;
  now?: () => number;
  scheduleTimeout?: typeof globalThis.setTimeout;
  cancelTimeout?: typeof globalThis.clearTimeout;
};

export class SyncRequestError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = true, readonly retryAfterMs?: number) { super(message); }
}

export function retryDelay(attempt: number, random: () => number): number {
  const base = Math.min(300_000, 1_000 * (2 ** Math.max(0, attempt - 1)));
  return Math.round(base * (0.75 + Math.min(1, Math.max(0, random())) * 0.5));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isMirrorSyncStatus(value: unknown): value is MirrorSyncStatus {
  if (!isRecord(value)) return false;
  const base = (value.status === 'not_configured' || value.status === 'pending' || value.status === 'syncing' || value.status === 'synced' || value.status === 'error')
    && typeof value.pendingCount === 'number' && Number.isFinite(value.pendingCount) && value.pendingCount >= 0
    && (value.quarantinedCount === undefined || value.quarantinedCount === null
      || (typeof value.quarantinedCount === 'number' && Number.isFinite(value.quarantinedCount) && value.quarantinedCount >= 0))
    && (value.lastSyncedAt === null || typeof value.lastSyncedAt === 'string')
    && (value.lastError === null || typeof value.lastError === 'string');
  if (!base || value.weeklyBackup === undefined) return base;
  const backup = value.weeklyBackup;
  return isRecord(backup)
    && (backup.status === 'not_configured' || backup.status === 'scheduled' || backup.status === 'created' || backup.status === 'error')
    && (backup.lastCreatedAt === null || typeof backup.lastCreatedAt === 'string')
    && (backup.lastError === null || typeof backup.lastError === 'string');
}
