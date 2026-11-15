import { describe, expect, it } from 'vitest';
import { derivePwaStatus, type ConnectivitySnapshot } from '../../../src/pwa/connectivity-store';

const base: ConnectivitySnapshot = {
  online: true,
  gate: { kind: 'online', reason: 'online' },
  sync: { phase: 'idle', pending: 0, quarantined: 0 },
  pendingStateKeys: 0,
  oversizedCount: 0,
  shellReady: false,
  updateReady: false,
  sha: 'synthetic-sha',
  imageCount: 0,
  imageBytes: 0,
};

describe('PWA status derivation', () => {
  it.each([
    ['checking', base],
    ['offline', { ...base, online: false }],
    ['queued', { ...base, sync: { ...base.sync, pending: 2 }, pendingStateKeys: 3 }],
    ['syncing', { ...base, sync: { ...base.sync, phase: 'syncing', pending: 1 } }],
    ['synced', { ...base, sync: { ...base.sync, phase: 'synced', lastSyncedAt: '2026-11-15T10:00:00Z' } }],
    ['needs_login', { ...base, gate: { kind: 'blocked', reason: 'needs_login' } }],
    ['needs_login', { ...base, gate: { kind: 'blocked', reason: 'needs_login' }, sync: { ...base.sync, pending: 2 } }],
    ['error', { ...base, sync: { ...base.sync, phase: 'error', lastError: 'synthetic error' } }],
    ['error', { ...base, oversizedCount: 1 }],
    ['update_ready', { ...base, updateReady: true }],
  ] as const)('derives %s from the current inputs', (expected, input) => {
    expect(derivePwaStatus(input).state).toBe(expected);
  });

  it('counts outbox events and coalesced state keys in the queue label', () => {
    const result = derivePwaStatus({ ...base, sync: { ...base.sync, pending: 2 }, pendingStateKeys: 3 });
    expect(result.queued).toBe(5);
    expect(result.label).toBe('در صف: ۵');
  });

  it('does not report a pending local-only reset as a sign-in requirement', () => {
    expect(derivePwaStatus({ ...base, gate: { kind: 'blocked', reason: 'local_only' } }).state).toBe('checking');
  });
});
