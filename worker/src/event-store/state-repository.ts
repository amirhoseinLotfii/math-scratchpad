import { MAX_SYNC_STATE_VALUE_BYTES, utf8Bytes } from '../../../shared/contracts/limits';
import { readBoundedBody } from '../body';
import { MAX_STATE_BODY_BYTES } from './limits';
import { json } from './response';
export function appStateRevision(storage: DurableObjectStorage): number {
  return Number(storage.sql.exec<{ revision: number }>('SELECT revision FROM app_state_meta WHERE singleton = 1').one().revision);
}

export function readAppState(storage: DurableObjectStorage): Response {
  const rows = storage.sql
    .exec<{
      key: string;
      value: string | null;
      revision: number;
      updated_at: string;
    }>('SELECT key, value, revision, updated_at FROM app_state ORDER BY key')
    .toArray();
  const records = rows.map(({ updated_at, ...record }) => ({ ...record, updatedAt: updated_at }));
  return json({ records, revision: appStateRevision(storage) });
}

export async function writeAppState(
  storage: DurableObjectStorage,
  request: Request,
  isLearningResetLocked: () => boolean,
  mirrorChange: (key: string, revision: number) => Promise<void>,
): Promise<Response> {
  const body = await readBoundedBody(request, MAX_STATE_BODY_BYTES);
  if (!body) return json({ error: 'payload_too_large' }, 413);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return json({ error: 'invalid_state_json' }, 400);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return json({ error: 'invalid_state' }, 400);
  const item = value as { key?: unknown; value?: unknown; revision?: unknown };
  if (
    typeof item.key !== 'string' ||
    !item.key.startsWith('math-scratchpad') ||
    item.key.length > 200 ||
    !(typeof item.value === 'string' || item.value === null) ||
    !Number.isSafeInteger(item.revision) ||
    Number(item.revision) < 0
  ) {
    return json({ error: 'invalid_state' }, 400);
  }
  const bytes = item.value === null ? 0 : utf8Bytes(item.value);
  if (bytes > MAX_SYNC_STATE_VALUE_BYTES) {
    return json({ error: 'state_value_too_large', key: item.key, bytes, limit: MAX_SYNC_STATE_VALUE_BYTES }, 413);
  }
  const result = storage.transactionSync(() => {
    if (isLearningResetLocked()) return { conflict: false, resetting: true, revision: 0, updatedAt: '' };
    const existing = storage.sql.exec<{ revision: number }>('SELECT revision FROM app_state WHERE key = ?', item.key!).toArray()[0];
    const current = existing?.revision ?? 0;
    if (current !== item.revision) return { conflict: true, resetting: false, revision: current };
    const revision = current + 1;
    const updatedAt = new Date().toISOString();
    storage.sql.exec(
      'INSERT INTO app_state (key, value, revision, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, revision=excluded.revision, updated_at=excluded.updated_at',
      item.key!,
      item.value as string | null,
      revision,
      updatedAt,
    );
    storage.sql.exec('UPDATE app_state_meta SET revision = revision + 1 WHERE singleton = 1');
    return { conflict: false, resetting: false, revision, updatedAt };
  });
  if (result.resetting) return json({ error: 'learning_reset_in_progress' }, 503, { 'Retry-After': '10' });
  if (result.conflict) return json({ error: 'state_conflict', revision: result.revision }, 409);
  await mirrorChange(item.key, result.revision);
  return json({ key: item.key, revision: result.revision, updatedAt: result.updatedAt });
}
