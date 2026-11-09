/**
 * Worker-issued owner sessions.
 *
 * A session is minted only after a verified Google ID token for OWNER_EMAIL.
 * The browser keeps the opaque bearer value; the Durable Object stores only its
 * SHA-256 digest, an absolute expiry, and a revocation time. Sessions cannot
 * be extended with another session: a fresh Google ID token is required.
 */
export const SESSION_TOKEN_PREFIX = 'mss1.';
/** Absolute lifetime; much longer than a one-hour GIS ID token, still bounded and revocable. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
/** Older active sessions beyond this count are revoked when a new one is issued. */
export const MAX_ACTIVE_SESSIONS = 10;
const SESSION_SECRET_BYTES = 32;
const SESSION_TOKEN_PATTERN = /^mss1\.[A-Za-z0-9_-]{43}$/;

export function isSessionToken(token: string): boolean {
  return token.startsWith(SESSION_TOKEN_PREFIX);
}

export function isWellFormedSessionToken(token: string): boolean {
  return SESSION_TOKEN_PATTERN.test(token);
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateSessionToken(): string {
  return `${SESSION_TOKEN_PREFIX}${base64Url(crypto.getRandomValues(new Uint8Array(SESSION_SECRET_BYTES)))}`;
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export const SESSION_HASH_PATTERN = /^[0-9a-f]{64}$/;
