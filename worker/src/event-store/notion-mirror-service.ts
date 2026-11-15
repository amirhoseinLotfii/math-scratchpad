import type { WorkerEnv } from '../env';
import {
  notionDataSourcesFromEnv,
  notionErrorCode,
  syncNotionAppState,
  syncNotionEvent,
  type NotionDataSources,
  type NotionErrorCode,
  type NotionEventContext,
  type NotionMirrorStatus,
} from '../notion-mirror';
import {
  applySessionEvent,
  isAttemptLikeEvent,
  tehranDayKey,
  type ConceptProjection,
  type DailyProjection,
  type SessionProjection,
} from '../notion-projection';
import { maxSequence, readEventsAfter } from './event-repository';
import { NOTION_DEBOUNCE_MS, NOTION_EVENTS_PER_RUN, NOTION_RETRY_MS, NOTION_STATE_KEYS_PER_RUN } from './limits';

export type StoredNotionMirrorState = {
  status: 'pending' | 'syncing' | 'synced' | 'error';
  lastSeq: number;
  pendingCount: number;
  quarantinedCount?: number;
  lastSyncedAt?: string;
  lastError?: NotionErrorCode;
};
type PendingNotionState = { key: string; revision: number };
type NotionSyncDependencies = {
  env: WorkerEnv;
  storage: DurableObjectStorage;
  ensureClient: (apiKey: string) => void;
  getNotionStatus: () => Promise<NotionMirrorStatus>;
  readNotionState: () => Promise<StoredNotionMirrorState>;
  notionStateQueueCount: () => number;
  saveNotionState: (state: StoredNotionMirrorState) => Promise<void>;
  notionPendingCount: (maxSeq: number, lastSeq: number) => number;
  repairNotionProjections: (through: number) => Promise<boolean>;
  scheduleAlarmIn: (delay: number) => Promise<void>;
  toNotionStatus: (state: StoredNotionMirrorState, maxSeq: number) => NotionMirrorStatus;
  readNotionProjection: <T>(kind: string, key: string) => T | undefined;
  createNotionContext: (dataSources: NotionDataSources, now: string) => NotionEventContext;
  recordDiagnostic: (destination: 'notion', stage: string, code: string) => void;
};

export async function performNotionSync(deps: NotionSyncDependencies): Promise<NotionMirrorStatus> {
  const dataSources = notionDataSourcesFromEnv(deps.env);
  if (!dataSources || !deps.env.NOTION_API_KEY) return deps.getNotionStatus();
  const state = await deps.readNotionState();
  const through = await maxSequence(deps.storage);
  if (through === state.lastSeq && deps.notionStateQueueCount() === 0 && state.status === 'synced') {
    // Backfill the SQL health dashboard for mirrors synced before the table existed.
    await deps.saveNotionState({ ...state, pendingCount: 0 });
    return deps.getNotionStatus();
  }
  await deps.saveNotionState({
    ...state,
    status: 'syncing',
    pendingCount: deps.notionPendingCount(through, state.lastSeq),
    lastError: undefined,
  });

  try {
    const projectionsReady = await deps.repairNotionProjections(through);
    if (!projectionsReady) {
      const rebuilding: StoredNotionMirrorState = {
        ...state,
        status: 'pending',
        pendingCount: deps.notionPendingCount(through, state.lastSeq),
        lastError: undefined,
      };
      await deps.saveNotionState(rebuilding);
      await deps.scheduleAlarmIn(NOTION_DEBOUNCE_MS);
      return deps.toNotionStatus(rebuilding, through);
    }

    deps.ensureClient(deps.env.NOTION_API_KEY);
    const events = readEventsAfter(deps.storage, state.lastSeq, through, NOTION_EVENTS_PER_RUN);
    let lastSeq = state.lastSeq;
    let lastSyncedAt = state.lastSyncedAt;
    let quarantinedCount = state.quarantinedCount ?? 0;
    for (const stored of events) {
      const event = stored.event;
      if (typeof event.isTest !== 'boolean') {
        quarantinedCount += 1;
        lastSeq = stored.seq;
        await deps.saveNotionState({
          status: 'pending',
          lastSeq,
          pendingCount: deps.notionPendingCount(through, lastSeq),
          quarantinedCount,
          ...(lastSyncedAt ? { lastSyncedAt } : {}),
        });
        continue;
      }
      const session = deps.readNotionProjection<SessionProjection>('session', event.session) ?? applySessionEvent(undefined, event);
      const daily = event.isTest ? undefined : deps.readNotionProjection<DailyProjection>('daily', tehranDayKey(event.ts));
      const conceptKey = [event.chapter, event.lesson, event.concept].join(':');
      const hasConceptUpdate = isAttemptLikeEvent(event) || event.type === 'mastery_changed' || event.type === 'gate_passed';
      const concept = event.isTest || !hasConceptUpdate ? undefined : deps.readNotionProjection<ConceptProjection>('concept', conceptKey);
      const context = deps.createNotionContext(dataSources, new Date().toISOString());
      await syncNotionEvent(context, { event, session, daily, concept });
      lastSeq = stored.seq;
      lastSyncedAt = new Date().toISOString();
      await deps.saveNotionState({
        status: 'pending',
        lastSeq,
        pendingCount: deps.notionPendingCount(through, lastSeq),
        quarantinedCount,
        lastSyncedAt,
      });
    }

    const queuedStateRows = deps.storage.sql
      .exec<PendingNotionState>('SELECT key, revision FROM notion_state_queue ORDER BY key LIMIT ?', NOTION_STATE_KEYS_PER_RUN)
      .toArray();
    for (const queued of queuedStateRows) {
      const current = deps.storage.sql
        .exec<{
          value: string | null;
          revision: number;
          updated_at: string;
        }>('SELECT value, revision, updated_at FROM app_state WHERE key = ?', queued.key)
        .toArray()[0];
      const revision = current ? Number(current.revision) : Number(queued.revision);
      const context = deps.createNotionContext(dataSources, new Date().toISOString());
      await syncNotionAppState(context, {
        key: queued.key,
        value: current?.value ?? null,
        revision,
        updatedAt: current?.updated_at ?? new Date().toISOString(),
      });
      deps.storage.sql.exec('DELETE FROM notion_state_queue WHERE key = ? AND revision <= ?', queued.key, revision);
      lastSyncedAt = new Date().toISOString();
      const currentMax = await maxSequence(deps.storage);
      await deps.saveNotionState({
        status: 'pending',
        lastSeq,
        pendingCount: deps.notionPendingCount(currentMax, lastSeq),
        quarantinedCount,
        lastSyncedAt,
      });
    }

    const currentMax = await maxSequence(deps.storage);
    const pendingCount = deps.notionPendingCount(currentMax, lastSeq);
    const completed: StoredNotionMirrorState = {
      status: pendingCount === 0 ? 'synced' : 'pending',
      lastSeq,
      pendingCount,
      quarantinedCount,
      lastSyncedAt: lastSyncedAt ?? new Date().toISOString(),
    };
    await deps.saveNotionState(completed);
    if (pendingCount > 0) await deps.scheduleAlarmIn(NOTION_DEBOUNCE_MS);
    return deps.toNotionStatus(completed, currentMax);
  } catch (error) {
    const currentMax = await maxSequence(deps.storage);
    const currentState = await deps.readNotionState();
    const failed: StoredNotionMirrorState = {
      ...currentState,
      status: 'error',
      pendingCount: deps.notionPendingCount(currentMax, currentState.lastSeq),
      lastError: notionErrorCode(error),
    };
    await deps.saveNotionState(failed);
    deps.recordDiagnostic('notion', 'notion_event_sync', failed.lastError ?? 'unknown');
    await deps.scheduleAlarmIn(NOTION_RETRY_MS);
    return deps.toNotionStatus(failed, currentMax);
  }
}
