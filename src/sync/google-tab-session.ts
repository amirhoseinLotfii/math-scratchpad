import { readDriveSessionToken, saveDriveSessionToken, type Token } from '../features/drive-bank/google';
import { commitGoogleIdToken, getGoogleIdToken } from './google-id-token';

// BroadcastChannel only connects open same-origin tabs; credentials are never
// written to localStorage/IndexedDB. Closing every tab ends the handoff.
const CHANNEL_NAME = 'math-scratchpad:google-session-handoff-v1';
type Request = { kind: 'request'; requestId: string };
type Reply = { kind: 'reply'; requestId: string; idToken: string; driveToken?: Token };
let channel: BroadcastChannel | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function onMessage(event: MessageEvent<unknown>): void {
  const value = event.data;
  if (!isRecord(value) || value.kind !== 'request' || typeof value.requestId !== 'string') return;
  const idToken = getGoogleIdToken();
  if (!idToken) return;
  const reply: Reply = {
    kind: 'reply', requestId: value.requestId, idToken,
    ...(readDriveSessionToken() ? { driveToken: readDriveSessionToken() } : {}),
  };
  channel?.postMessage(reply);
}

function currentChannel(): BroadcastChannel | undefined {
  if (typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function') return undefined;
  if (!channel) {
    try {
      channel = new window.BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener('message', onMessage);
    } catch { return undefined; }
  }
  return channel;
}

/** Begin answering same-origin tab handoff requests, even before login. */
export function startGoogleTabSession(): void { currentChannel(); }

/**
 * Recover short-lived ID and Drive credentials from an already-open app tab.
 * Does not bypass Google consent or renew expired credentials.
 */
export function restoreGoogleTabSession(timeoutMs = 900): Promise<boolean> {
  const active = currentChannel();
  if (!active) return Promise.resolve(false);
  if (getGoogleIdToken() && readDriveSessionToken()) return Promise.resolve(true);
  const requestId = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return new Promise(resolve => {
    let settled = false;
    let timer = 0;
    const finish = (restored: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      active.removeEventListener('message', receive);
      resolve(restored);
    };
    const receive = (event: MessageEvent<unknown>) => {
      const value = event.data;
      if (!isRecord(value) || value.kind !== 'reply' || value.requestId !== requestId || typeof value.idToken !== 'string') return;
      try {
        // Preserve Drive permission only if Google already issued an unexpired token.
        const drive = value.driveToken;
        if (isRecord(drive) && typeof drive.accessToken === 'string'
          && typeof drive.expiresAt === 'number' && drive.expiresAt > Date.now() + 60_000) {
          saveDriveSessionToken({ accessToken: drive.accessToken, expiresAt: drive.expiresAt });
        }
        commitGoogleIdToken(value.idToken);
        finish(true);
      } catch { /* Ignore expired or malformed credentials and keep the sign-in option. */ }
    };
    active.addEventListener('message', receive);
    timer = window.setTimeout(() => finish(false), timeoutMs);
    try { active.postMessage({ kind: 'request', requestId } satisfies Request); }
    catch { finish(false); }
  });
}

export function stopGoogleTabSession(): void {
  channel?.removeEventListener('message', onMessage);
  channel?.close();
  channel = undefined;
}
