/**
 * Dependency-free notice that the sync Worker answered 401 for a bearer token.
 * worker-session.ts listens and forgets an expired or revoked Worker session.
 * Kept separate so storage modules shared with the Worker bundle do not import
 * browser-only Google sign-in code.
 */
export const API_UNAUTHORIZED_EVENT = 'math-scratchpad:api-unauthorized';

export function reportApiUnauthorized(token: string | null | undefined): void {
  if (!token || typeof globalThis.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') return;
  globalThis.dispatchEvent(new CustomEvent<string>(API_UNAUTHORIZED_EVENT, { detail: token }));
}
