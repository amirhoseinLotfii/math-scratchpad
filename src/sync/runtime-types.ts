import type { LearnEvent } from './events';

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
  readOnly: true;
  canExecute: false;
  scope: 'all';
  matchingEvents: number;
  totalEvents: number;
  lastSeq: number;
  appStateRevision: number;
  protectedBankAndIdentityStateKeys: number;
  sharedStateKeysRequiringSelectiveMerge: number;
  notionPageReferencesRequiringReconciliation: number | null;
  requiresCloudReconciliation: true;
  warning: string;
};

export type SyncPage = {
  events: Array<{ seq: number; event: LearnEvent }>;
  cursor: number;
  through: number;
  hasMore: boolean;
  snapshotCursor?: number;
};
export type AckResponse = { events: Array<{ id: string; seq: number; duplicate: boolean }>; cursor: number };
