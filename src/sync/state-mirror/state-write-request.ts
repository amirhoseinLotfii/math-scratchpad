import { utf8Bytes } from '../../../shared/contracts/limits';
import { SYNC_API_ORIGIN } from '../sync-config';
import {
  fetchWithServerWriteGuard,
  getLearningResetRequestEpoch,
  LEARNING_RESET_EPOCH_HEADER,
  markLocalLearningResetPending,
  setLocalPendingResetEpoch,
  isValidLearningResetEpoch,
} from '../learning-reset-epoch';

export async function postStateWrite(token: string, key: string, value: string | null, revision: number, keepalive: boolean) {
  const body = JSON.stringify({ key, value: value, revision });
  const response = await fetchWithServerWriteGuard(fetch, `${SYNC_API_ORIGIN}/state`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      [LEARNING_RESET_EPOCH_HEADER]: getLearningResetRequestEpoch(),
    },
    body,
    ...(keepalive && utf8Bytes(body) <= 60_000 ? { keepalive: true } : {}),
  });
  if (response.status === 426) {
    const body: unknown = await response
      .clone()
      .json()
      .catch(() => null);
    const requiredEpoch =
      body && typeof body === 'object' && 'requiredEpoch' in body ? (body as { requiredEpoch?: unknown }).requiredEpoch : undefined;
    if (isValidLearningResetEpoch(requiredEpoch)) setLocalPendingResetEpoch(requiredEpoch);
    markLocalLearningResetPending();
  }
  return response;
}
