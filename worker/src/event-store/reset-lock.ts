import { LEARNING_RESET_EPOCH } from '../../../shared/contracts/reset-epoch';
import { LEARNING_RESET_TABLE } from './limits';
import { json } from './response';

export function isLearningResetLocked(storage: DurableObjectStorage): boolean {
  const status = storage.sql
    .exec<{ status: string }>(`SELECT status FROM ${LEARNING_RESET_TABLE} WHERE singleton = 1`)
    .toArray()[0]?.status;
  return status === 'running' || status === 'awaiting_release';
}

export function requiredLearningClientEpoch(storage: DurableObjectStorage): string | null {
  return (
    storage.sql.exec<{ client_epoch: string | null }>(`SELECT client_epoch FROM ${LEARNING_RESET_TABLE} WHERE singleton = 1`).toArray()[0]
      ?.client_epoch ?? null
  );
}

export function learningResetEpoch(storage: DurableObjectStorage): Response {
  if (isLearningResetLocked(storage)) return json({ error: 'learning_reset_in_progress' }, 503, { 'Retry-After': '10' });
  return json({ epoch: requiredLearningClientEpoch(storage) ?? LEARNING_RESET_EPOCH });
}

export function isLearningOrMirrorRoute(pathname: string, method: string): boolean {
  if (pathname.startsWith('/internal/session/') || pathname.startsWith('/bank/')) return false;
  if (method === 'GET' && ['/reset/preview', '/state', '/sync', '/snapshot', '/drive/status', '/notion/status'].includes(pathname))
    return false;
  return true;
}
