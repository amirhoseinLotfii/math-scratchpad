import { reportApiUnauthorized } from '../api-unauthorized';
import { SYNC_API_ORIGIN } from '../sync-config';
import type { ServerSnapshot } from './server-storage-types';

function isSnapshot(value: unknown): value is ServerSnapshot {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return Array.isArray(row.records) && Number.isSafeInteger(row.revision)
    && row.records.every(x => !!x && typeof x.key === 'string' && x.key.startsWith('math-scratchpad')
      && (typeof x.value === 'string' || x.value === null) && Number.isSafeInteger(x.revision)
      && (x.updatedAt === undefined || typeof x.updatedAt === 'string'));
}

export async function readServerSnapshot(token: string, signal?: AbortSignal): Promise<ServerSnapshot> {
  const response = await fetch(`${SYNC_API_ORIGIN}/state`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  });
  if (response.status === 401) reportApiUnauthorized(token);
  if (!response.ok) throw new Error(response.status === 401
    ? 'برای خواندن اطلاعات از سرور باید دوباره با Google وارد شوی.'
    : `دریافت وضعیت ذخیره‌شدهٔ سرور ناموفق بود (HTTP ${response.status}).`);
  const value: unknown = await response.json();
  if (!isSnapshot(value)) throw new Error('پاسخ وضعیت یادگیری از سرور معتبر نیست.');
  return value;
}

/** Tiny owner-authenticated heartbeat; it avoids downloading the learning snapshot. */
export async function verifyOwnerServerConnection(token: string, signal?: AbortSignal): Promise<void> {
  const response = await fetch(`${SYNC_API_ORIGIN}/drive/status`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', ...(signal ? { signal } : {}),
  });
  if (response.status === 401) reportApiUnauthorized(token);
  if (!response.ok) throw new Error(response.status === 401
    ? 'ورود Google منقضی شده است؛ برای ادامه دوباره وارد شو.'
    : `دسترسی احراز هویت‌شده به سرور تأیید نشد (HTTP ${response.status}).`);
}
