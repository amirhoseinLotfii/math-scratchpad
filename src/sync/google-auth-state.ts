export const GOOGLE_AUTH_STATE_EVENT = 'math-scratchpad:google-auth-changed';

export function announceGoogleAuthStateChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(GOOGLE_AUTH_STATE_EVENT));
}
