import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearTokens,
  getDriveAccessToken,
  getSessionToken,
  isDriveTokenValid,
  setDriveAccessToken,
  setSessionToken
} from '../../src/auth/token-manager';

describe('In-Memory Token Manager - AC-S8', () => {
  beforeEach(() => {
    clearTokens();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('stores and retrieves tokens in memory without writing to localStorage or sessionStorage', () => {
    setSessionToken('session-secret-123', 3600);
    setDriveAccessToken('drive-access-456', 1800);

    expect(getSessionToken()).toBe('session-secret-123');
    expect(getDriveAccessToken()).toBe('drive-access-456');
    expect(isDriveTokenValid()).toBe(true);

    // Assert strictly zero tokens in web storage (AC-S8)
    expect(localStorage.getItem('sessionToken')).toBeNull();
    expect(localStorage.getItem('driveAccessToken')).toBeNull();
    expect(sessionStorage.getItem('sessionToken')).toBeNull();
  });

  it('expires tokens automatically after duration passes', () => {
    // Set token with negative expiry (already expired)
    setDriveAccessToken('expired-token', -10);
    expect(getDriveAccessToken()).toBeNull();
    expect(isDriveTokenValid()).toBe(false);
  });

  it('clears all tokens cleanly on logout', () => {
    setSessionToken('token-a', 100);
    setDriveAccessToken('token-b', 100);
    clearTokens();

    expect(getSessionToken()).toBeNull();
    expect(getDriveAccessToken()).toBeNull();
  });
});
