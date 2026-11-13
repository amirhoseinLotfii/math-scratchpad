export const LEARNING_RESET_EPOCH = '2026-11-12-v3';
export const LEARNING_RESET_EPOCH_HEADER = 'X-Math-Scratchpad-Reset-Epoch';
export const LOCAL_SERVER_RESET_EPOCH_KEY = 'math-scratchpad-server-learning-reset-epoch-v1';
export const LOCAL_RESET_PENDING_KEY = 'math-scratchpad-local-learning-reset-pending-v1';
export const LOCAL_PENDING_RESET_EPOCH_KEY = 'math-scratchpad-pending-learning-reset-epoch-v1';
export const LOCAL_PENDING_RESET_SCOPE_KEY = 'math-scratchpad-pending-learning-reset-scope-v1';
export const LEARNING_RESET_REQUIRED_EVENT = 'math-scratchpad:learning-reset-required';
export const SERVER_WRITE_GUARD_CHANGED_EVENT = 'math-scratchpad:server-write-guard-changed';
export const LOCAL_RESET_STATE_CHANGED_EVENT = 'math-scratchpad:local-reset-state-changed';
export const LOCAL_PENDING_EPOCH_PREFIX = 'local-pending:';

const activeServerWrites = new Set<AbortController>();
let serverResetStatusVerified = true;
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
    return serverResetStatusVerified && !!storage && storage.getItem(LOCAL_RESET_PENDING_KEY) !== '1';
  } catch {
    return false;
  }
}

function notifyWriteGuardChanged(): void {
  if (browserWindow) {
    browserWindow.dispatchEvent(new Event(SERVER_WRITE_GUARD_CHANGED_EVENT));
    browserWindow.dispatchEvent(new Event(LOCAL_RESET_STATE_CHANGED_EVENT));
  }
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

  // A browser may abort a keepalive request when its document is discarded if the
  // request carries an AbortSignal. Check the shared guard before and after send;
  // the Worker remains authoritative while this unload-safe request is in flight.
  if (init.keepalive) {
    const response = await fetcher(input, init);
    if (!canWriteToServer()) throw new ServerWriteBlockedError();
    return response;
  }

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
    if (event.key !== LOCAL_RESET_PENDING_KEY) return;
    if (event.newValue === '1') abortActiveServerWrites();
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
    getLocalPendingResetCreationEpoch();
    abortActiveServerWrites();
    notifyWriteGuardChanged();
  }
  catch { /* A blocked browser storage must fail closed at the caller. */ }
}

/** Current server candidate while locked, or a durable local marker until it is known. */
export function getLocalPendingResetCreationEpoch(): string {
  try {
    const storage = globalThis.localStorage;
    const candidate = storage.getItem(LOCAL_PENDING_RESET_EPOCH_KEY);
    if (isValidLearningResetEpoch(candidate)) return candidate;
    let scope = storage.getItem(LOCAL_PENDING_RESET_SCOPE_KEY);
    if (!scope) {
      scope = crypto.randomUUID();
      storage.setItem(LOCAL_PENDING_RESET_SCOPE_KEY, scope);
    }
    return `${LOCAL_PENDING_EPOCH_PREFIX}${scope}`;
  } catch {
    return `${LOCAL_PENDING_EPOCH_PREFIX}unavailable`;
  }
}

export function hasLocalPendingResetMetadata(): boolean {
  try {
    return !!globalThis.localStorage.getItem(LOCAL_PENDING_RESET_EPOCH_KEY)
      || !!globalThis.localStorage.getItem(LOCAL_PENDING_RESET_SCOPE_KEY);
  } catch { return true; }
}

export function setLocalPendingResetEpoch(epoch: string): void {
  if (!isValidLearningResetEpoch(epoch)) throw new Error('The pending reset epoch is invalid.');
  try { globalThis.localStorage.setItem(LOCAL_PENDING_RESET_EPOCH_KEY, epoch); }
  catch { /* The caller keeps the write guard closed. */ }
}

export function clearLocalPendingResetMetadata(): void {
  try {
    globalThis.localStorage.removeItem(LOCAL_PENDING_RESET_EPOCH_KEY);
    globalThis.localStorage.removeItem(LOCAL_PENDING_RESET_SCOPE_KEY);
  } catch { /* The reset guard remains authoritative if storage is unavailable. */ }
}

/** Fail closed before the first status check; the editor can still use local storage. */
export function markServerResetStatusUnknown(): void {
  serverResetStatusVerified = false;
  abortActiveServerWrites();
  notifyWriteGuardChanged();
}

export function markServerResetStatusVerified(): void {
  serverResetStatusVerified = true;
  notifyWriteGuardChanged();
}

export function isServerResetStatusVerified(): boolean {
  return serverResetStatusVerified;
}

export function notifyServerWriteGuardReleased(): void {
  notifyWriteGuardChanged();
}

export function requestLearningResetReload(): void {
  const browser = globalThis as typeof globalThis & { window?: { dispatchEvent: (event: Event) => boolean } };
  if (browser.window) browser.window.dispatchEvent(new Event(LEARNING_RESET_REQUIRED_EVENT));
}
