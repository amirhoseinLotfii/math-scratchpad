/**
 * In-Memory Token Manager - AC-S8
 * Strictly keeps Google access tokens and Worker session tokens in volatile memory.
 * NEVER persists raw tokens to localStorage or sessionStorage.
 */

export interface TokenState {
  sessionToken: string | null;
  sessionExpiresAtMs: number;
  driveAccessToken: string | null;
  driveTokenExpiresAtMs: number;
  isAuthorized: boolean;
}

export const AUTH_STATE_CHANGED_EVENT = 'math-scratchpad:auth-state-changed';

let currentTokens: TokenState = {
  sessionToken: null,
  sessionExpiresAtMs: 0,
  driveAccessToken: null,
  driveTokenExpiresAtMs: 0,
  isAuthorized: false
};

function notifyStateChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(AUTH_STATE_CHANGED_EVENT, { detail: { ...currentTokens } })
    );
  }
}

export function setSessionToken(token: string, expiresInSeconds: number): void {
  currentTokens.sessionToken = token;
  currentTokens.sessionExpiresAtMs = Date.now() + expiresInSeconds * 1000;
  currentTokens.isAuthorized = true;
  notifyStateChanged();
}

export function setDriveAccessToken(token: string, expiresInSeconds: number): void {
  currentTokens.driveAccessToken = token;
  currentTokens.driveTokenExpiresAtMs = Date.now() + expiresInSeconds * 1000;
  currentTokens.isAuthorized = true;
  notifyStateChanged();
}

export function getSessionToken(): string | null {
  if (currentTokens.sessionExpiresAtMs > 0 && Date.now() > currentTokens.sessionExpiresAtMs) {
    clearTokens();
    return null;
  }
  return currentTokens.sessionToken;
}

export function getDriveAccessToken(): string | null {
  if (currentTokens.driveTokenExpiresAtMs > 0 && Date.now() > currentTokens.driveTokenExpiresAtMs) {
    currentTokens.driveAccessToken = null;
    currentTokens.driveTokenExpiresAtMs = 0;
    notifyStateChanged();
    return null;
  }
  return currentTokens.driveAccessToken;
}

export function isDriveTokenValid(): boolean {
  return Boolean(getDriveAccessToken());
}

export function clearTokens(): void {
  currentTokens = {
    sessionToken: null,
    sessionExpiresAtMs: 0,
    driveAccessToken: null,
    driveTokenExpiresAtMs: 0,
    isAuthorized: false
  };
  notifyStateChanged();
}
