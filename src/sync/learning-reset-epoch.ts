export const LEARNING_RESET_EPOCH = '2026-11-12-v3';
export const LEARNING_RESET_EPOCH_HEADER = 'X-Math-Scratchpad-Reset-Epoch';
export const LOCAL_SERVER_RESET_EPOCH_KEY = 'math-scratchpad-server-learning-reset-epoch-v1';
export const LOCAL_RESET_PENDING_KEY = 'math-scratchpad-local-learning-reset-pending-v1';
export const LEARNING_RESET_REQUIRED_EVENT = 'math-scratchpad:learning-reset-required';

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
  try { localStorage.setItem(LOCAL_RESET_PENDING_KEY, '1'); }
  catch { /* A blocked browser storage must fail closed at the caller. */ }
}

export function requestLearningResetReload(): void {
  const browser = globalThis as typeof globalThis & { window?: { dispatchEvent: (event: Event) => boolean } };
  if (browser.window) browser.window.dispatchEvent(new Event(LEARNING_RESET_REQUIRED_EVENT));
}
