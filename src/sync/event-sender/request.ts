import { completeLocalLearningReset } from '../browser-db';
import { reportApiUnauthorized } from '../api-unauthorized';
import {
  markLocalLearningResetPending,
  setLocalPendingResetEpoch,
  isValidLearningResetEpoch,
  LEARNING_RESET_EPOCH_HEADER,
  fetchWithServerWriteGuard,
  ServerWriteBlockedError,
} from '../learning-reset-epoch';

type SyncRequestDependencies = {
  token: string | null;
  apiOrigin: string;
  fetcher: typeof fetch;
  learningResetEpoch: string;
  canWrite: () => boolean;
  handleResetEpoch: (epoch: string) => Promise<void>;
};

export class SyncRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = true,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

export function retryDelay(attempt: number, random: () => number): number {
  const base = Math.min(300_000, 1_000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.75 + Math.min(1, Math.max(0, random())) * 0.5));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export async function requestSync(
  deps: SyncRequestDependencies,
  path: string,
  init: RequestInit,
  tokenOverride?: string,
  allowNotFound = false,
): Promise<Response> {
  const token = tokenOverride ?? deps.token;
  if (!token) throw new SyncRequestError('Google sign-in is required.', 401, false);
  const method = (init.method ?? 'GET').toUpperCase();
  const isServerWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (isServerWrite && !deps.canWrite()) {
    throw new SyncRequestError('ارسال تا تأیید پایان پاک‌سازی متوقف است؛ هیچ داده‌ای فرستاده نشد.', 409, false);
  }
  const isLearningWrite = init.method?.toUpperCase() === 'POST' && (path === '/events' || path === '/state');
  let response: Response;
  try {
    const requestInit: RequestInit = {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        ...(isLearningWrite ? { [LEARNING_RESET_EPOCH_HEADER]: deps.learningResetEpoch } : {}),
      },
    };
    response = isServerWrite
      ? await fetchWithServerWriteGuard(deps.fetcher, `${deps.apiOrigin}${path}`, requestInit)
      : await deps.fetcher(`${deps.apiOrigin}${path}`, requestInit);
  } catch (error) {
    if (error instanceof ServerWriteBlockedError || (isServerWrite && !deps.canWrite())) {
      throw new SyncRequestError('ارسال تا تأیید پایان پاک‌سازی متوقف است؛ هیچ داده‌ای فرستاده نشد.', 409, false);
    }
    throw new SyncRequestError('شبکه در دسترس نیست؛ داده‌ها در صف آفلاین می‌مانند.');
  }
  if (response.status === 401) {
    // An expired or revoked Worker session is forgotten so a fresh GIS login can mint a new one.
    reportApiUnauthorized(token);
    throw new SyncRequestError('ورود گوگل منقضی شده است؛ دوباره متصل شو.', 401, false);
  }
  if (response.status === 404 && allowNotFound) return response;
  if (response.status === 426 && isLearningWrite) {
    const body: unknown = await response
      .clone()
      .json()
      .catch(() => null);
    const epoch = isRecord(body) && isValidLearningResetEpoch(body.requiredEpoch) ? body.requiredEpoch : null;
    if (epoch) {
      markLocalLearningResetPending();
      setLocalPendingResetEpoch(epoch);
      await completeLocalLearningReset(epoch);
      await deps.handleResetEpoch(epoch);
    }
    throw new SyncRequestError('نسل پاک‌سازی تغییر کرده؛ این داده ارسال نشد.', 426, false);
  }
  if (response.status === 429) {
    const seconds = Number(response.headers.get('Retry-After'));
    throw new SyncRequestError(
      'درخواست‌های همگام‌سازی زیاد شده؛ ارسال دوباره زمان‌بندی می‌شود.',
      429,
      true,
      Number.isFinite(seconds) ? seconds * 1_000 : undefined,
    );
  }
  if (!response.ok) throw new SyncRequestError(`سرور همگام‌سازی پاسخ ${response.status} داد.`, response.status, response.status >= 500);
  return response;
}
