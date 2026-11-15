import type { WorkerEnv } from '../env';
import { notionDataSourcesFromEnv, type NotionMirrorStatus } from '../notion-mirror';
import { NOTION_DEBOUNCE_MS, NOTION_MIRROR_STATE_KEY } from './limits';
import { maxSequence } from './event-repository';
import type { StoredNotionMirrorState } from './notion-mirror-service';

type NotionQueueDependencies = {
  env: WorkerEnv;
  storage: DurableObjectStorage;
  isLearningResetLocked: () => boolean;
  scheduleAlarmIn: (delay: number) => Promise<void>;
};

export async function readNotionState(storage: DurableObjectStorage): Promise<StoredNotionMirrorState> {
  return (
    (await storage.get<StoredNotionMirrorState>(NOTION_MIRROR_STATE_KEY)) ?? {
      status: 'pending',
      lastSeq: 0,
      pendingCount: 0,
      quarantinedCount: undefined,
    }
  );
}

export async function saveNotionState(storage: DurableObjectStorage, state: StoredNotionMirrorState): Promise<void> {
  await storage.put(NOTION_MIRROR_STATE_KEY, state);
  storage.sql.exec(
    'INSERT INTO sync_health (destination, status, pending_count, last_error, last_synced_at, ' +
      'updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(destination) DO UPDATE SET ' +
      'status=excluded.status, pending_count=excluded.pending_count, ' +
      'last_error=excluded.last_error, last_synced_at=excluded.last_synced_at, ' +
      'updated_at=excluded.updated_at',
    'notion',
    state.status,
    state.pendingCount,
    state.lastError ?? null,
    state.lastSyncedAt ?? null,
    new Date().toISOString(),
  );
}

export async function getNotionStatus(storage: DurableObjectStorage, env: WorkerEnv): Promise<NotionMirrorStatus> {
  const maxSeq = await maxSequence(storage);
  if (!notionDataSourcesFromEnv(env)) {
    return { status: 'not_configured', lastSyncedAt: null, pendingCount: maxSeq, quarantinedCount: null, lastError: null };
  }
  const state = await readNotionState(storage);
  return {
    status: state.status,
    lastSyncedAt: state.lastSyncedAt ?? null,
    pendingCount: notionPendingCount(storage, maxSeq, state.lastSeq),
    quarantinedCount: state.quarantinedCount ?? null,
    lastError: state.lastError ?? null,
  };
}

export function notionStateQueueCount(storage: DurableObjectStorage): number {
  return Number(storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM notion_state_queue').one().count);
}

export function notionPendingCount(storage: DurableObjectStorage, maxSeq: number, lastSeq: number): number {
  return Math.max(0, maxSeq - lastSeq) + notionStateQueueCount(storage);
}

export async function queueNotionState(deps: NotionQueueDependencies, key: string, revision: number): Promise<void> {
  if (deps.isLearningResetLocked()) return;
  if (!notionDataSourcesFromEnv(deps.env)) return;
  // The archive is mirrored as a raw state record while it is live. Chapter
  // snapshots remain append-only learning events before local cleanup.
  deps.storage.sql.exec(
    'INSERT INTO notion_state_queue(key,revision) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET revision=MAX(revision,excluded.revision)',
    key,
    revision,
  );
  const state = await readNotionState(deps.storage);
  const maxSeq = await maxSequence(deps.storage);
  await saveNotionState(deps.storage, {
    ...state,
    status: 'pending',
    pendingCount: notionPendingCount(deps.storage, maxSeq, state.lastSeq),
    lastError: state.lastError,
  });
  await deps.scheduleAlarmIn(NOTION_DEBOUNCE_MS);
}

export async function queueNotionMirror(deps: NotionQueueDependencies, cursor: number): Promise<void> {
  if (deps.isLearningResetLocked()) return;
  if (!notionDataSourcesFromEnv(deps.env)) return;
  const state = await readNotionState(deps.storage);
  if (cursor <= state.lastSeq) return;
  const maxSeq = await maxSequence(deps.storage);
  await saveNotionState(deps.storage, {
    ...state,
    status: 'pending',
    pendingCount: notionPendingCount(deps.storage, maxSeq, state.lastSeq),
    // Keep the last failure visible until a mirror run actually succeeds.
    lastError: state.lastError,
  });
  await deps.scheduleAlarmIn(NOTION_DEBOUNCE_MS);
}
