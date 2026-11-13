export const LEARNING_RESET_EPOCH = '2026-11-12-v3';
export const LEARNING_RESET_EPOCH_HEADER = 'X-Math-Scratchpad-Reset-Epoch';
export const LOCAL_SERVER_RESET_EPOCH_KEY = 'math-scratchpad-server-learning-reset-epoch-v1';
export const LOCAL_RESET_PENDING_KEY = 'math-scratchpad-local-learning-reset-pending-v1';
export const LEARNING_RESET_REQUIRED_EVENT = 'math-scratchpad:learning-reset-required';
export const SERVER_WRITE_GUARD_CHANGED_EVENT = 'math-scratchpad:server-write-guard-changed';

const activeServerWrites = new Set<AbortController>();
const browserWindow = (globalThis as typeof globalThis & {
  window?: {
    dispatchEvent: (event: Event) => boolean;
    addEventListener: (type: string, listener: (event: { key: string | null; newValue: string | null }) => void) => void;
  };
}).window;

export class ServerWriteBlockedError extends Error {
  constructor() {
    super('ارسال تا تأیید پایان پاک‌سازی متوقف است.');
    this.name = 'ServerWriteBlockedError';
  }
}

/** One fail-closed decision shared by every learning write to the sync Worker. */
export function canWriteToServer(): boolean {
  try {
    const storage = globalThis.localStorage;
    return !!storage && storage.getItem(LOCAL_RESET_PENDING_KEY) !== '1';
  } catch {
    return false;
  }
}

function notifyWriteGuardChanged(): void {
  if (browserWindow) browserWindow.dispatchEvent(new Event(SERVER_WRITE_GUARD_CHANGED_EVENT));
}

function abortActiveServerWrites(): void {
  for (const controller of activeServerWrites) controller.abort(new ServerWriteBlockedError());
}

/** Route a mutating Worker request through the shared guard and cancel it if reset starts. */
export async function fetchWithServerWriteGuard(
  fetcher: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const requestMethod = typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET';
  const method = (init.method ?? requestMethod).toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return fetcher(input, init);
  if (!canWriteToServer()) throw new ServerWriteBlockedError();

  const controller = new AbortController();
  const callerSignal = init.signal;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
  activeServerWrites.add(controller);
  try {
    if (!canWriteToServer()) throw new ServerWriteBlockedError();
    const response = await fetcher(input, { ...init, signal: controller.signal });
    if (!canWriteToServer()) {
      controller.abort(new ServerWriteBlockedError());
      throw new ServerWriteBlockedError();
    }
    return response;
  } catch (error) {
    if (!canWriteToServer()) throw new ServerWriteBlockedError();
    throw error;
  } finally {
    callerSignal?.removeEventListener('abort', abortFromCaller);
    activeServerWrites.delete(controller);
  }
}

if (browserWindow) {
  browserWindow.addEventListener('storage', event => {
    if (event.key !== LOCAL_RESET_PENDING_KEY || event.newValue !== '1') return;
    abortActiveServerWrites();
    notifyWriteGuardChanged();
  });
}

export function isValidLearningResetEpoch(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128
    && /^[a-zA-Z0-9._:-]+$/.test(value);
}

export function getLearningResetRequestEpoch(): string {
  try {
    return localStorage.getItem(LOCAL_SERVER_RESET_EPOCH_KEY) || LEARNING_RESET_EPOCH;
  } catch {
    return LEARNING_RESET_EPOCH;
  }
}

export function getStoredServerLearningResetEpoch(): string | null {
  try { return localStorage.getItem(LOCAL_SERVER_RESET_EPOCH_KEY); }
  catch { return null; }
}

export function markLocalLearningResetPending(): void {
  try {
    localStorage.setItem(LOCAL_RESET_PENDING_KEY, '1');
    abortActiveServerWrites();
    notifyWriteGuardChanged();
  }
  catch { /* A blocked browser storage must fail closed at the caller. */ }
}

export function notifyServerWriteGuardReleased(): void {
  notifyWriteGuardChanged();
}

export function requestLearningResetReload(): void {
  const browser = globalThis as typeof globalThis & { window?: { dispatchEvent: (event: Event) => boolean } };
  if (browser.window) browser.window.dispatchEvent(new Event(LEARNING_RESET_REQUIRED_EVENT));
}
