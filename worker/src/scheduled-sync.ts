import { configuredOwner } from './owner';
import type { WorkerEnv } from './env';

function safeMirrorError(value: unknown): string {
  const allowed = new Set([
    'not_configured',
    'reauthorization_required',
    'account_mismatch',
    'permission_denied',
    'quota_exceeded',
    'etag_conflict',
    'invalid_response',
    'duplicate_file',
    'subrequest_budget_exceeded',
    'network_error',
    'token_invalid',
    'database_not_shared',
    'schema_mismatch',
    'rate_limited',
    'remote_error',
  ]);
  return typeof value === 'string' && allowed.has(value) ? value : 'unknown';
}

function safeMirrorStage(value: unknown): string {
  return typeof value === 'string' && /^[a-z0-9_]{1,80}$/.test(value) ? value : 'unknown';
}

export async function requestMirrorSync(env: Pick<WorkerEnv, 'EVENT_STORE' | 'OWNER_EMAIL'>): Promise<void> {
  const owner = configuredOwner(env);
  if (!owner) throw new Error('owner_not_configured');
  const id = env.EVENT_STORE.idFromName(owner);
  const response = await env.EVENT_STORE.get(id).fetch(new Request('https://event-store.internal/internal/sync-all', { method: 'POST' }));
  if (!response.ok) {
    console.warn('scheduled_mirror_sync_failed', { stage: 'durable_object_request', status: response.status });
    throw new Error('scheduled_mirror_sync_failed');
  }
  const state = (await response.json()) as {
    drive?: { status?: string; lastError?: unknown; failureStage?: unknown };
    notion?: { status?: string; lastError?: unknown };
    subrequestsUsed?: unknown;
    subrequestLimit?: unknown;
  };
  const failures = [
    ...(state.drive?.status === 'error'
      ? [{ destination: 'drive', errorCode: safeMirrorError(state.drive.lastError), stage: safeMirrorStage(state.drive.failureStage) }]
      : []),
    ...(state.notion?.status === 'error'
      ? [{ destination: 'notion', errorCode: safeMirrorError(state.notion.lastError), stage: 'notion_event_sync' }]
      : []),
  ];
  const used = Number.isSafeInteger(state.subrequestsUsed) ? Number(state.subrequestsUsed) : null;
  const limit = Number.isSafeInteger(state.subrequestLimit) ? Number(state.subrequestLimit) : null;
  if (failures.length) {
    console.warn('scheduled_mirror_sync_incomplete', { failures, subrequestsUsed: used, subrequestLimit: limit });
    throw new Error('scheduled_mirror_retry_incomplete');
  }
}

export async function requestWeeklyDriveBackup(env: Pick<WorkerEnv, 'EVENT_STORE' | 'OWNER_EMAIL'>, scheduledTime: number): Promise<void> {
  const owner = configuredOwner(env);
  if (!owner || !Number.isSafeInteger(scheduledTime) || scheduledTime <= 0) throw new Error('weekly_backup_request_invalid');
  const id = env.EVENT_STORE.idFromName(owner);
  const stub = env.EVENT_STORE.get(id);
  const response = await stub.fetch(
    new Request(`https://event-store.internal/internal/weekly-backup?scheduledTime=${scheduledTime}`, { method: 'POST' }),
  );
  if (!response.ok) throw new Error('weekly_backup_request_failed');
}
