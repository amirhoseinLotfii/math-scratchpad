import { learnEventSchema } from '../../../shared/contracts/learn-event';
import type { ScopedResetDependencies } from './scoped-reset-preview';
import { readBoundedBody } from '../body';
import { isScopedResetSharedStateKey } from '../../../shared/contracts/storage-keys';
import { parseScopedLearningResetScope, type ScopedLearningResetScope } from '../scoped-reset-plan';
import { canonicalJson } from './canonical-json';
import {
  SCOPED_RESET_OPERATIONS_TABLE,
  MAX_SCOPED_RESET_BODY_BYTES,
  MAX_SCOPED_RESET_REBUILD_EVENTS,
  SCOPED_RESET_REVIEW_CONFIRMATION,
  SCOPED_RESET_DELETE_CONFIRMATION,
} from './limits';
import type { ScopedResetSnapshot } from './scoped-reset-snapshot';
import { appStateRevision as readAppStateRevision } from './state-repository';
import { json } from './response';

type ScopedResetOperationRow = {
  operation_id: string;
  scope_json: string;
  snapshot_token: string;
  state: 'prepared' | 'approved' | 'completed' | 'expired';
  expires_at: number;
  result_json: string | null;
};
export async function executeScopedReset(deps: ScopedResetDependencies, request: Request): Promise<Response> {
  if (deps.env.SCOPED_RESET_ENABLED !== 'true') return json({ error: 'scoped_reset_disabled' }, 503);
  const raw = await readBoundedBody(request, MAX_SCOPED_RESET_BODY_BYTES);
  if (!raw) return json({ error: 'payload_too_large' }, 413);
  let input: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json({ error: 'invalid_scoped_reset_request' }, 400);
    input = parsed as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_scoped_reset_request' }, 400);
  }

  const action = input.action;
  const operationId = input.operationId;
  const headerKey = request.headers.get('Idempotency-Key');
  if (
    (action !== 'confirm_review' && action !== 'confirm_delete' && action !== 'execute') ||
    typeof operationId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId) ||
    headerKey !== operationId
  ) {
    return json({ error: 'invalid_scoped_reset_request' }, 400);
  }

  const now = Date.now();
  return deps.storage.transactionSync(() => {
    if (deps.isLearningResetLocked()) return json({ error: 'learning_reset_in_progress' }, 503, { 'Retry-After': '10' });

    if (action === 'confirm_review') {
      const allowed = new Set(['action', 'operationId', 'scope', 'snapshotToken', 'confirmation']);
      if (
        Object.keys(input).some((key) => !allowed.has(key)) ||
        input.confirmation !== SCOPED_RESET_REVIEW_CONFIRMATION ||
        typeof input.snapshotToken !== 'string' ||
        !/^scoped-v1-[0-9a-f]{16}$/.test(input.snapshotToken)
      ) {
        return json({ error: 'invalid_scoped_reset_confirmation' }, 400);
      }
      const scope = parseScopedLearningResetScope(input.scope);
      if (!scope) return json({ error: 'invalid_reset_scope' }, 400);
      const scopeJson = canonicalJson(scope);
      const existing = readScopedResetOperation(deps.storage, operationId);
      if (existing) {
        if (existing.scope_json !== scopeJson || existing.snapshot_token !== input.snapshotToken) {
          return json({ error: 'idempotency_key_conflict' }, 409);
        }
        return scopedResetOperationResponse(existing, true);
      }
      const plan = deps.snapshot(scope);
      if (plan.blockers.length > 0) return json({ error: 'scoped_reset_not_safe', blockers: plan.blockers }, 409);
      if (plan.snapshotToken !== input.snapshotToken) return json({ error: 'stale_reset_preview' }, 409);
      const timestamp = new Date(now).toISOString();
      deps.storage.sql.exec(
        `INSERT INTO ${SCOPED_RESET_OPERATIONS_TABLE}
          (operation_id, scope_json, snapshot_token, state, expires_at, result_json, created_at, updated_at)
         VALUES (?, ?, ?, 'prepared', ?, NULL, ?, ?)`,
        operationId,
        scopeJson,
        input.snapshotToken,
        now + 5 * 60_000,
        timestamp,
        timestamp,
      );
      return json({ operationId, state: 'prepared', next: 'confirm_delete', expiresAt: now + 5 * 60_000 });
    }

    const existing = readScopedResetOperation(deps.storage, operationId);
    if (!existing) return json({ error: 'scoped_reset_operation_not_found' }, 409);
    if (existing.state === 'completed') return scopedResetOperationResponse(existing, true);
    if (existing.expires_at < now) {
      deps.storage.sql.exec(
        `UPDATE ${SCOPED_RESET_OPERATIONS_TABLE} SET state = 'expired', updated_at = ? WHERE operation_id = ? AND state != 'completed'`,
        new Date(now).toISOString(),
        operationId,
      );
      return json({ error: 'scoped_reset_confirmation_expired' }, 409);
    }
    const scope = parseScopedLearningResetScope(JSON.parse(existing.scope_json));
    if (!scope) return json({ error: 'scoped_reset_operation_corrupt' }, 500);

    if (action === 'confirm_delete') {
      if (
        Object.keys(input).some((key) => !['action', 'operationId', 'confirmation'].includes(key)) ||
        input.confirmation !== SCOPED_RESET_DELETE_CONFIRMATION
      ) {
        return json({ error: 'invalid_scoped_reset_confirmation' }, 400);
      }
      if (existing.state === 'approved') return scopedResetOperationResponse(existing, true);
      if (existing.state !== 'prepared') return json({ error: 'scoped_reset_confirmation_required' }, 409);
      const plan = deps.snapshot(scope);
      if (plan.blockers.length > 0) return json({ error: 'scoped_reset_not_safe', blockers: plan.blockers }, 409);
      if (plan.snapshotToken !== existing.snapshot_token) return json({ error: 'stale_reset_preview' }, 409);
      deps.storage.sql.exec(
        `UPDATE ${SCOPED_RESET_OPERATIONS_TABLE} SET state = 'approved', updated_at = ? WHERE operation_id = ? AND state = 'prepared'`,
        new Date(now).toISOString(),
        operationId,
      );
      return json({ operationId, state: 'approved', next: 'execute' });
    }

    if (Object.keys(input).some((key) => !['action', 'operationId'].includes(key))) {
      return json({ error: 'invalid_scoped_reset_request' }, 400);
    }
    if (existing.state !== 'approved') return json({ error: 'scoped_reset_two_confirmations_required' }, 409);
    const plan = deps.snapshot(scope);
    if (plan.blockers.length > 0) return json({ error: 'scoped_reset_not_safe', blockers: plan.blockers }, 409);
    if (plan.snapshotToken !== existing.snapshot_token) return json({ error: 'stale_reset_preview' }, 409);

    const allEvents = deps.storage.sql
      .exec<{ event_json: string }>('SELECT event_json FROM learning_events ORDER BY seq ASC LIMIT ?', MAX_SCOPED_RESET_REBUILD_EVENTS + 1)
      .toArray();
    const allEventsValid = allEvents.every((row) => {
      try {
        return learnEventSchema.safeParse(JSON.parse(row.event_json)).success;
      } catch {
        return false;
      }
    });
    if (allEvents.length > MAX_SCOPED_RESET_REBUILD_EVENTS || !allEventsValid) {
      return json({ error: 'projection_rebuild_not_safe' }, 409);
    }

    for (let offset = 0; offset < plan.removableEventIds.length; offset += 100) {
      const batch = plan.removableEventIds.slice(offset, offset + 100);
      const placeholders = batch.map(() => '?').join(',');
      deps.storage.sql.exec(`DELETE FROM learning_events WHERE event_id IN (${placeholders})`, ...batch);
    }
    deps.rebuildNotionProjections();
    const result = {
      operationId,
      completed: true,
      deletedEvents: plan.removableEventIds.length,
      preservedEvents: plan.totalEvents - plan.removableEventIds.length,
      preservedAppStateRecords: Number(deps.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM app_state').one().count),
      completedAt: new Date(now).toISOString(),
      cloudReconciliation: 'not_configured',
    };
    const resultJson = JSON.stringify(result);
    deps.storage.sql.exec(
      `UPDATE ${SCOPED_RESET_OPERATIONS_TABLE} SET state = 'completed', result_json = ?, updated_at = ? WHERE operation_id = ? AND state = 'approved'`,
      resultJson,
      new Date(now).toISOString(),
      operationId,
    );
    return json(result);
  });
}

function readScopedResetOperation(storage: DurableObjectStorage, operationId: string): ScopedResetOperationRow | undefined {
  return storage.sql
    .exec<ScopedResetOperationRow>(
      `SELECT operation_id, scope_json, snapshot_token, state, expires_at, result_json
     FROM ${SCOPED_RESET_OPERATIONS_TABLE} WHERE operation_id = ?`,
      operationId,
    )
    .toArray()[0];
}

function scopedResetOperationResponse(operation: ScopedResetOperationRow, idempotent: boolean): Response {
  if (operation.state === 'completed' && operation.result_json) {
    const result = JSON.parse(operation.result_json) as Record<string, unknown>;
    return json({ ...result, ...(idempotent ? { idempotent: true } : {}) });
  }
  return json({
    operationId: operation.operation_id,
    state: operation.state,
    next: operation.state === 'prepared' ? 'confirm_delete' : operation.state === 'approved' ? 'execute' : undefined,
    expiresAt: operation.expires_at,
    ...(idempotent ? { idempotent: true } : {}),
  });
}
