import { reportApiUnauthorized } from '../api-unauthorized';
import {
  canWriteToServer,
  fetchWithServerWriteGuard,
  getLearningResetRequestEpoch,
  isValidLearningResetEpoch,
  LEARNING_RESET_EPOCH_HEADER,
  markLocalLearningResetPending,
  ServerWriteBlockedError,
  setLocalPendingResetEpoch,
} from '../learning-reset-epoch';
import { SYNC_API_ORIGIN } from '../sync-config';
import { mergeServerStateValues } from './server-conflict-merge';
import { readServerSnapshot } from './server-snapshot-client';
import type { ServerStorageConflict } from './server-storage-types';

export type ServerWriteContext = {
  token: string;
  getRevision: (key: string) => number;
  setRevision: (key: string, revision: number) => void;
  getBaseValue: (key: string) => string | null;
  setBaseValue: (key: string, value: string | null) => void;
  getLatestLocalValue: (key: string) => string | null;
  setLocalValue: (key: string, value: string | null) => void;
  hasConflict: (key: string) => boolean;
  onConflict: (conflict: ServerStorageConflict) => void;
  onServerMerge: (key: string, value: string | null) => void;
  onClearFailedWrite: (key: string) => void;
  onSuccessRecord: (key: string, desiredValue: string | null, revision: number) => void;
};

export async function writeServerRecordWithRetry(key: string, value: string | null, ctx: ServerWriteContext): Promise<void> {
  if (ctx.hasConflict(key)) return;
  let response: Response | undefined;
  let lastNetworkError: Error | undefined;
  let desiredValue = value;
  // Fast, bounded retries for transient Cloudflare/network errors and stale revisions.
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!canWriteToServer()) throw new ServerWriteBlockedError();
    const revision = ctx.getRevision(key);
    try {
      response = await fetchWithServerWriteGuard(fetch, `${SYNC_API_ORIGIN}/state`, {
        method: 'POST', cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ctx.token}`,
          [LEARNING_RESET_EPOCH_HEADER]: getLearningResetRequestEpoch(),
        },
        body: JSON.stringify({ key, value: desiredValue, revision }),
      });
      if (response.status === 426) {
        const body: unknown = await response.clone().json().catch(() => null);
        const requiredEpoch = body && typeof body === 'object' && 'requiredEpoch' in body
          ? (body as { requiredEpoch?: unknown }).requiredEpoch
          : undefined;
        if (isValidLearningResetEpoch(requiredEpoch)) setLocalPendingResetEpoch(requiredEpoch);
        markLocalLearningResetPending();
      }
      if (response.status === 409) {
        const snapshot = await readServerSnapshot(ctx.token);
        const remote = snapshot.records.find(record => record.key === key);
        const remoteValue = remote?.value ?? null;
        const remoteRevision = remote?.revision ?? 0;
        const localValue = ctx.getLatestLocalValue(key);
        const baseValue = ctx.getBaseValue(key);
        const merge = mergeServerStateValues(key, baseValue, localValue, remoteValue);
        ctx.setRevision(key, remoteRevision);
        ctx.setBaseValue(key, remoteValue);

        if (!merge.ok) {
          const conflict = { key, localValue, remoteValue, remoteRevision } satisfies ServerStorageConflict;
          ctx.setLocalValue(key, localValue);
          ctx.onConflict(conflict);
          return;
        }

        desiredValue = merge.value;
        ctx.setLocalValue(key, desiredValue);
        if (desiredValue !== localValue) ctx.onServerMerge(key, desiredValue);
        if (desiredValue === remoteValue) {
          ctx.onClearFailedWrite(key);
          return;
        }
        if (attempt < 3) continue;
        throw new Error('Server state kept changing while merging this saved item. Try again.');
      }
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      if (error instanceof ServerWriteBlockedError) throw error;
      lastNetworkError = error instanceof Error ? error : new Error('Network request failed.');
    }
    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 250 * (2 ** attempt)));
  }
  if (!response) throw lastNetworkError ?? new Error('دسترسی به سرور ذخیره‌سازی برقرار نشد.');
  if (response.status === 401) reportApiUnauthorized(ctx.token);
  if (!response.ok) throw new Error(response.status === 409
    ? 'این داده در دستگاه دیگری تغییر کرده است؛ پیش از ادامه صفحه را دوباره بارگذاری کن.'
    : response.status === 401
      ? 'ورود Google منقضی شده است؛ ذخیرهٔ روی سرور تأیید نشد.'
      : `ذخیرهٔ سروری ${key} ناموفق بود (HTTP ${response.status}).`);
  const result: unknown = await response.json();
  if (!canWriteToServer()) throw new ServerWriteBlockedError();
  if (!result || typeof result !== 'object' || !Number.isSafeInteger((result as { revision?: unknown }).revision))
    throw new Error('تأیید ذخیرهٔ سروری معتبر نبود.');
  ctx.onSuccessRecord(key, desiredValue, Number((result as { revision: number }).revision));
}
