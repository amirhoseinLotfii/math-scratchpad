import { learnEventSchema } from '../../../shared/contracts/learn-event';
import { isScopedResetSharedStateKey } from '../../../shared/contracts/storage-keys';
import { classifyScopedLearningEvent, type ScopedLearningResetScope } from '../scoped-reset-plan';
import { canonicalJson } from './canonical-json';
import { LEARNING_RESET_TABLE, MAX_SCOPED_RESET_REBUILD_EVENTS } from './limits';
import { appStateRevision as readAppStateRevision } from './state-repository';

type ScopedResetEventRow = { seq: number; event_id: string; event_json: string };
export type ScopedResetSnapshot = {
  scope: ScopedLearningResetScope;
  snapshotToken: string;
  matchingEvents: number;
  totalEvents: number;
  lastSeq: number;
  appStateRevision: number;
  removableEventIds: string[];
  blockers: string[];
};

/** A compact optimistic-concurrency fingerprint; authorization is enforced separately. */
function scopedResetFingerprint(value: string): string {
  let hash = 14_695_981_039_346_656_037n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 1_099_511_628_211n);
  }
  return `scoped-v1-${hash.toString(16).padStart(16, '0')}`;
}

/** Builds a stable, owner-local snapshot. The token changes if any relevant data changes. */
export function buildScopedResetSnapshot(
  storage: DurableObjectStorage,
  configuredMirrors: { drive: boolean; notion: boolean },
  scope: ScopedLearningResetScope,
): ScopedResetSnapshot {
  const fields = scope.type === 'chapter' ? (['bankVersion', 'chapter'] as const) : (['bankVersion', 'chapter', 'lesson'] as const);
  const values: Record<string, string | number> =
    scope.type === 'chapter'
      ? { bankVersion: scope.bankVersion, chapter: Number(scope.id) }
      : { bankVersion: scope.bankVersion, chapter: scope.chapter, lesson: scope.id };
  const where = fields
    .map((name) =>
      name === 'chapter' ? `json_extract(event_json, '$.chapter') = CAST(? AS INTEGER)` : `json_extract(event_json, '$.${name}') = ?`,
    )
    .join(' AND ');
  const matchingCount = Number(
    storage.sql
      .exec<{ count: number }>(`SELECT COUNT(*) AS count FROM learning_events WHERE ${where}`, ...fields.map((name) => values[name]))
      .one().count,
  );
  const matchingRows = storage.sql
    .exec<ScopedResetEventRow>(
      `SELECT seq, event_id, event_json FROM learning_events WHERE ${where} ORDER BY seq ASC LIMIT ?`,
      ...fields.map((name) => values[name]),
      MAX_SCOPED_RESET_REBUILD_EVENTS + 1,
    )
    .toArray();
  const stats = storage.sql
    .exec<{ count: number; lastSeq: number | null }>('SELECT COUNT(*) AS count, MAX(seq) AS lastSeq FROM learning_events')
    .one();
  const appStateRows = storage.sql
    .exec<{
      key: string;
      value: string | null;
      revision: number;
      updated_at: string;
    }>('SELECT key, value, revision, updated_at FROM app_state ORDER BY key')
    .toArray();
  const appStateRevision = readAppStateRevision(storage);
  const sharedStateKeyCount = appStateRows.filter((row) => isScopedResetSharedStateKey(row.key)).length;
  const notionPageCount = Number(storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM notion_page_refs').one().count);
  const notionQueueCount = Number(storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM notion_state_queue').one().count);
  const notionMistakeIndexCount = Number(
    storage.sql
      .exec<{
        count: number;
      }>('SELECT (SELECT COUNT(*) FROM notion_mistake_reviews) + (SELECT COUNT(*) FROM notion_session_mistakes) AS count')
      .one().count,
  );
  const notionResetPendingCount = Number(
    storage.sql
      .exec<{
        count: number;
      }>("SELECT COUNT(*) AS count FROM notion_reset_reconciliation WHERE status IN ('pending', 'retry', 'ownership_unverified')")
      .one().count,
  );
  const mirrorHealth = storage.sql
    .exec<{
      destination: string;
      status: string;
      pending_count: number;
    }>("SELECT destination, status, pending_count FROM sync_health WHERE destination IN ('drive','notion') ORDER BY destination")
    .toArray();
  const resetStatus = storage.sql.exec<{ status: string }>(`SELECT status FROM ${LEARNING_RESET_TABLE} WHERE singleton = 1`).one().status;
  const blockers = new Set<string>();
  const removableEventIds: string[] = [];
  if (sharedStateKeyCount > 0) blockers.add('learning_state_requires_selective_merge');
  if (notionPageCount > 0) blockers.add('notion_pages_require_reconciliation');
  if (notionQueueCount > 0 || notionMistakeIndexCount > 0 || notionResetPendingCount > 0) {
    blockers.add('notion_sync_state_requires_reconciliation');
  }
  if (configuredMirrors.drive || configuredMirrors.notion || mirrorHealth.some((item) => item.status !== 'not_configured'))
    blockers.add('cloud_mirror_requires_reconciliation');
  if (resetStatus === 'running' || resetStatus === 'awaiting_release') blockers.add('full_reset_in_progress');
  if (Number(stats.count) > MAX_SCOPED_RESET_REBUILD_EVENTS || matchingCount > MAX_SCOPED_RESET_REBUILD_EVENTS) {
    blockers.add('projection_rebuild_too_large');
  }

  for (const row of matchingRows) {
    let value: unknown;
    try {
      value = JSON.parse(row.event_json);
    } catch {
      blockers.add('matching_event_invalid');
      continue;
    }
    const parsed = learnEventSchema.safeParse(value);
    if (!parsed.success) {
      blockers.add('matching_event_invalid');
      continue;
    }
    const disposition = classifyScopedLearningEvent(parsed.data, scope);
    if (disposition === 'remove') removableEventIds.push(row.event_id);
    else if (disposition === 'rebuild') blockers.add('aggregate_event_requires_rebuild');
    else blockers.add('event_outside_scope');
  }

  const lastSeq = Number(stats.lastSeq ?? 0);
  const totalEvents = Number(stats.count);
  const snapshotPayload = canonicalJson({
    scope,
    matchingRows,
    totalEvents,
    lastSeq,
    appStateRevision,
    appStateRows,
    notionPageCount,
    notionQueueCount,
    notionMistakeIndexCount,
    notionResetPendingCount,
    mirrorHealth,
    configuredMirrors,
    resetStatus,
  });
  return {
    scope,
    snapshotToken: scopedResetFingerprint(snapshotPayload),
    matchingEvents: matchingCount,
    totalEvents,
    lastSeq,
    appStateRevision,
    removableEventIds,
    blockers: [...blockers].sort(),
  };
}
