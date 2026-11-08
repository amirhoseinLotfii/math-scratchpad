import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDriveSessionToken, readDriveSessionToken } from '../../src/features/drive-bank/google';
import { clearGoogleIdToken, getGoogleIdToken } from '../../src/sync/google-id-token';
import { restoreGoogleTabSession, startGoogleTabSession, stopGoogleTabSession } from '../../src/sync/google-tab-session';

type MessageHandler = (event: MessageEvent) => void;
class FakeChannel {
  static instances = new Set<FakeChannel>();
  handlers = new Set<MessageHandler>();
  constructor(readonly name: string) { FakeChannel.instances.add(this); }
  addEventListener(_type: string, handler: MessageHandler) { this.handlers.add(handler); }
  removeEventListener(_type: string, handler: MessageHandler) { this.handlers.delete(handler); }
  postMessage(data: unknown) {
    for (const other of FakeChannel.instances) {
      if (other === this || other.name !== this.name) continue;
      queueMicrotask(() => { for (const handler of other.handlers) handler({ data } as MessageEvent); });
    }
  }
  close() { FakeChannel.instances.delete(this); this.handlers.clear(); }
}
function credential(expiresAt: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(expiresAt / 1000) }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `header.${payload}.signature`;
}

afterEach(() => {
  stopGoogleTabSession();
  clearGoogleIdToken();
  clearDriveSessionToken();
  FakeChannel.instances.clear();
  vi.unstubAllGlobals();
});

describe('same-origin short-lived Google session handoff', () => {
  it('reuses still-valid account and Drive credentials from an existing tab without localStorage', async () => {
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    const expiresAt = Date.now() + 3_600_000;
    const idToken = credential(expiresAt);
    startGoogleTabSession();
    const peer = new FakeChannel('math-scratchpad:google-session-handoff-v1');
    peer.addEventListener('message', event => {
      if (event.data?.kind === 'request') {
        peer.postMessage({
          kind: 'reply', requestId: event.data.requestId, idToken,
          driveToken: { accessToken: 'temporary-drive-credential', expiresAt },
        });
      }
    });
    expect(await restoreGoogleTabSession()).toBe(true);
    expect(getGoogleIdToken()).toBe(idToken);
    expect(readDriveSessionToken()?.accessToken).toBe('temporary-drive-credential');
    expect(localStorage.getItem('math-scratchpad-google-id-token-v1')).toBeNull();
    expect(localStorage.getItem('math-scratchpad-drive-token-v1')).toBeNull();
    peer.close();
  });

  it('rejects stale peer credentials and retains the normal sign-in path', async () => {
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    startGoogleTabSession();
    const peer = new FakeChannel('math-scratchpad:google-session-handoff-v1');
    peer.addEventListener('message', event => {
      if (event.data?.kind === 'request') peer.postMessage({
        kind: 'reply', requestId: event.data.requestId, idToken: credential(Date.now() - 20_000),
      });
    });
    expect(await restoreGoogleTabSession(25)).toBe(false);
    expect(getGoogleIdToken()).toBeUndefined();
    peer.close();
  });
});
