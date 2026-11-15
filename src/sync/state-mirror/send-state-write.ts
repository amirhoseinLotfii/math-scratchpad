import { reportApiUnauthorized } from '../api-unauthorized';
import { canWriteToServer, ServerWriteBlockedError } from '../learning-reset-epoch';
import { postStateWrite } from './state-write-request';

type StateWritePorts = {
  token: () => string;
  revision: () => number;
  mergeConflict: () => Promise<{ done: true } | { done: false; value: string | null }>;
  currentValue: () => string | null;
  markOversized: (bytes: number) => void;
};

export async function sendStateWrite(key: string, value: string | null, bytes: number, keepalive: boolean, ports: StateWritePorts) {
  let response: Response | undefined;
  let lastNetworkError: Error | undefined;
  let desiredValue = value;
  // Fast, bounded retries for transient Cloudflare/network errors and stale revisions.
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!canWriteToServer()) throw new ServerWriteBlockedError();
    const revision = ports.revision();
    try {
      response = await postStateWrite(ports.token(), key, desiredValue, revision, keepalive);
      if (response.status === 409) {
        const result = await ports.mergeConflict();
        if (result.done) return;
        desiredValue = result.value;
        if (attempt < 3) continue;
        throw new Error('Server state kept changing while merging this saved item. Try again.');
      }
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      if (error instanceof ServerWriteBlockedError) throw error;
      lastNetworkError = error instanceof Error ? error : new Error('Network request failed.');
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  if (!response) throw lastNetworkError ?? new Error('دسترسی به سرور ذخیره‌سازی برقرار نشد.');
  if (response.status === 401) reportApiUnauthorized(ports.token());
  if (response.status === 413) {
    const limit = await response.json().catch(() => null);
    if (limit && typeof limit === 'object' && 'error' in limit && limit.error === 'state_value_too_large') {
      if (ports.currentValue() === desiredValue) {
        const rejectedBytes = 'bytes' in limit && typeof limit.bytes === 'number' ? limit.bytes : bytes;
        ports.markOversized(rejectedBytes);
      }
      return;
    }
  }
  if (!response.ok)
    throw new Error(
      response.status === 409
        ? 'این داده در دستگاه دیگری تغییر کرده است؛ پیش از ادامه صفحه را دوباره بارگذاری کن.'
        : response.status === 401
          ? 'ورود Google منقضی شده است؛ ذخیرهٔ روی سرور تأیید نشد.'
          : `ذخیرهٔ سروری ${key} ناموفق بود (HTTP ${response.status}).`,
    );
  const result: unknown = await response.json();
  if (!canWriteToServer()) throw new ServerWriteBlockedError();
  if (!result || typeof result !== 'object' || !Number.isSafeInteger((result as { revision?: unknown }).revision))
    throw new Error('تأیید ذخیرهٔ سروری معتبر نبود.');
  return { revision: Number((result as { revision: number }).revision), desiredValue };
}
