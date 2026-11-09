export const GOOGLE_AUTH_STATE_EVENT = 'math-scratchpad:google-auth-changed';

const CROSS_TAB_AUTH_KEYS = new Set([
  'math-scratchpad-google-id-token-v1',
  'math-scratchpad-drive-token-v1',
]);

export function announceGoogleAuthStateChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(GOOGLE_AUTH_STATE_EVENT));
}

/** Shared browser storage so Google login survives refresh and a new tab. */
export function readAuthRecord(key: string): string | null {
  try {
    const local = localStorage.getItem(key);
    if (local) return local;
    const session = sessionStorage.getItem(key);
    if (session) {
      try {
        localStorage.setItem(key, session);
        sessionStorage.removeItem(key);
      } catch { /* Migrating an older tab-only session is best-effort. */ }
      return session;
    }
  } catch { /* Storage may be blocked. */ }
  return null;
}

export function writeAuthRecord(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* The in-memory credential still works for this page. */ }
  try { sessionStorage.removeItem(key); } catch { /* Older tab-only copies can stay if storage is blocked. */ }
}

export function clearAuthRecord(key: string): void {
  try { localStorage.removeItem(key); } catch { /* Storage may be blocked. */ }
  try { sessionStorage.removeItem(key); } catch { /* Storage may be blocked. */ }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key && CROSS_TAB_AUTH_KEYS.has(event.key)) announceGoogleAuthStateChanged();
  });
}
