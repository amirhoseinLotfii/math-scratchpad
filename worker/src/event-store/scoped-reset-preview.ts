import type { WorkerEnv } from '../env';
import { readBoundedBody } from '../body';
import { isScopedResetSharedStateKey } from '../../../shared/contracts/storage-keys';
import { parseScopedLearningResetScope, type ScopedLearningResetScope } from '../scoped-reset-plan';
import { canonicalJson } from './canonical-json';
import {
  SCOPED_RESET_OPERATIONS_TABLE,
  MAX_SCOPED_RESET_BODY_BYTES,
  SCOPED_RESET_REVIEW_CONFIRMATION,
  SCOPED_RESET_DELETE_CONFIRMATION,
} from './limits';
import type { ScopedResetSnapshot } from './scoped-reset-snapshot';
import { appStateRevision as readAppStateRevision } from './state-repository';
import { json } from './response';

export type ScopedResetDependencies = {
  storage: DurableObjectStorage;
  env: WorkerEnv;
  isLearningResetLocked: () => boolean;
  snapshot: (scope: ScopedLearningResetScope) => ScopedResetSnapshot;
  rebuildNotionProjections: () => void;
};

/** Read-only, owner-authenticated preflight. Never deletes or mutates learning data. */
export function resetPreview(deps: ScopedResetDependencies, url: URL): Response {
  const scope = url.searchParams.get('scope');
  if (scope !== 'all' && scope !== 'session' && scope !== 'lesson' && scope !== 'section' && scope !== 'chapter') {
    return json({ error: 'invalid_reset_scope' }, 400);
  }
  const requested = ['bankVersion', 'session', 'lesson', 'section', 'chapter'] as const;
  const values = Object.fromEntries(requested.map((name) => [name, url.searchParams.get(name)])) as Record<
    (typeof requested)[number],
    string | null
  >;
  if (
    requested.some(
      (name) => values[name] !== null && (!values[name]?.trim() || values[name]!.length > 120 || /[\x00-\x1f]/.test(values[name]!)),
    )
  ) {
    return json({ error: 'invalid_reset_scope' }, 400);
  }
  // Chapter uses the numeric chapter field of an event. Reject ambiguous or invalid IDs.
  if (['chapter', 'lesson', 'section'].includes(scope) && !/^[1-9][0-9]{0,5}$/.test(values.chapter ?? '')) {
    return json({ error: 'invalid_reset_chapter' }, 400);
  }
  const required =
    scope === 'section'
      ? ['bankVersion', 'chapter', 'lesson', 'section']
      : scope === 'lesson'
        ? ['bankVersion', 'chapter', 'lesson']
        : scope === 'chapter'
          ? ['bankVersion', 'chapter']
          : scope === 'session'
            ? ['session']
            : [];
  if (requested.some((name) => values[name] !== null && !required.includes(name))) return json({ error: 'invalid_reset_scope' }, 400);
  if (required.some((name) => !values[name as keyof typeof values])) return json({ error: 'missing_reset_filter' }, 400);
  const fields =
    scope === 'section'
      ? (['bankVersion', 'chapter', 'lesson', 'section'] as const)
      : scope === 'lesson'
        ? (['bankVersion', 'chapter', 'lesson'] as const)
        : scope === 'chapter'
          ? (['bankVersion', 'chapter'] as const)
          : scope === 'session'
            ? (['session'] as const)
            : ([] as const);
  const where = fields.length
    ? ` WHERE ${fields
        .map((name) =>
          name === 'chapter' ? `json_extract(event_json, '$.chapter') = CAST(? AS INTEGER)` : `json_extract(event_json, '$.${name}') = ?`,
        )
        .join(' AND ')}`
    : '';
  const args = fields.map((name) => values[name]!);
  const matchingEvents = Number(
    deps.storage.sql.exec<{ count: number }>(`SELECT COUNT(*) AS count FROM learning_events${where}`, ...args).one().count,
  );
  const overall = deps.storage.sql
    .exec<{ count: number; lastSeq: number | null }>('SELECT COUNT(*) AS count, MAX(seq) AS lastSeq FROM learning_events')
    .one();
  const stateKeys = deps.storage.sql
    .exec<{ key: string }>("SELECT key FROM app_state WHERE key LIKE 'math-scratchpad-%'")
    .toArray()
    .map((record) => record.key);
  const protectedStateKeys = stateKeys.filter(
    (key) => key.includes('drive-config') || key.includes('bank-cache') || key.includes('device-id'),
  );
  const affectedSharedStateKeys = stateKeys.filter(isScopedResetSharedStateKey);
  const notionPages = Number(deps.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM notion_page_refs').one().count);
  let scopedExecution: Record<string, unknown> | undefined;
  if (scope === 'lesson' || scope === 'chapter') {
    const parsedScope =
      scope === 'lesson'
        ? parseScopedLearningResetScope({
            type: 'lesson',
            id: values.lesson,
            chapter: Number(values.chapter),
            bankVersion: values.bankVersion,
          })
        : parseScopedLearningResetScope({
            type: 'chapter',
            id: values.chapter,
            bankVersion: values.bankVersion,
          });
    if (parsedScope) {
      const plan = deps.snapshot(parsedScope);
      const enabled = deps.env.SCOPED_RESET_ENABLED === 'true';
      scopedExecution = {
        enabled,
        eligible: enabled && plan.blockers.length === 0,
        snapshotToken: plan.snapshotToken,
        matchingEvents: plan.matchingEvents,
        removableEvents: plan.removableEventIds.length,
        blockers: [...plan.blockers, ...(!enabled ? ['feature_disabled'] : [])].sort(),
      };
    } else {
      scopedExecution = {
        enabled: deps.env.SCOPED_RESET_ENABLED === 'true',
        eligible: false,
        snapshotToken: null,
        matchingEvents,
        removableEvents: 0,
        blockers: ['unsupported_or_invalid_scope'],
      };
    }
  }
  return json({
    readOnly: true,
    canExecute: false,
    scope,
    filters: Object.fromEntries(fields.map((name) => [name, values[name]])),
    matchingEvents,
    totalEvents: Number(overall.count),
    lastSeq: Number(overall.lastSeq ?? 0),
    appStateRevision: readAppStateRevision(deps.storage),
    protectedBankAndIdentityStateKeys: protectedStateKeys.length,
    sharedStateKeysRequiringSelectiveMerge: affectedSharedStateKeys.length,
    notionPageReferencesRequiringReconciliation: scope === 'all' ? notionPages : null,
    requiresCloudReconciliation: true,
    ...(scopedExecution ? { scopedExecution } : {}),
    warning: 'Preview only. Scoped execution is disabled unless its Worker flag is enabled and every safety check passes.',
  });
}
