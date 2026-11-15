import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { BrowserSyncRuntime, setDefaultSyncRuntime } from '../../src/sync/runtime';
import { getLearningDb, initializeLearningStorage, resetLearningDbForTests, storeServerEvents } from '../../src/sync/browser-db';
import { queueLegacyMigration, verifyLegacyMigrationOnServer } from '../../src/sync/legacy-migration';
import { permittedAccount } from '../../src/features/drive-bank/identity';
import { exchangeIdTokenForWorkerSession, resetWorkerSessionForTests } from '../../src/sync/worker-session';
import { clearGoogleIdToken, commitGoogleIdToken } from '../../src/sync/google-id-token';

// Ensure Node.js webcrypto is available as globalThis.crypto for tests
// In jsdom, globalThis.crypto is a getter-only property, so we need to redefine it
Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
  writable: true,
  configurable: true,
  enumerable: true,
});

export const LEGACY_KEY = 'math-scratchpad-session-v3';
export const TEST_ID_TOKEN = `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, email: 'owner@example.test' }))
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')}.signature`;
export const TEST_WORKER_SESSION = `mss1.${'T'.repeat(43)}`;

export function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

export function installGooglePicker(action: 'picked' | 'cancel' = 'picked') {
  let idCallback: ((response: { credential?: string }) => void) | undefined;
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, email: 'owner@example.test' }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const identity = {
    initialize(options: { callback: (response: { credential?: string }) => void }) {
      idCallback = options.callback;
    },
    prompt() {
      idCallback?.({ credential: `header.${payload}.signature` });
    },
    renderButton(element: HTMLElement) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Sign in with Google';
      button.setAttribute('aria-label', 'Sign in with Google');
      button.addEventListener('click', () => idCallback?.({ credential: `header.${payload}.signature` }));
      element.replaceChildren(button);
    },
  };
  class FakeDocsView {
    setSelectFolderEnabled() {
      return this;
    }
    setMode() {
      return this;
    }
  }
  class FakePickerBuilder {
    private callback?: (result: { action: string; docs?: Array<{ id: string; name: string }> }) => void;
    addView() {
      return this;
    }
    setOAuthToken() {
      return this;
    }
    setDeveloperKey() {
      return this;
    }
    setAppId() {
      return this;
    }
    setOrigin() {
      return this;
    }
    setLocale() {
      return this;
    }
    setTitle() {
      return this;
    }
    setCallback(callback: (result: { action: string; docs?: Array<{ id: string; name: string }> }) => void) {
      this.callback = callback;
      return this;
    }
    build() {
      return {
        setVisible: () =>
          this.callback?.(
            action === 'picked' ? { action: 'picked', docs: [{ id: 'backup-folder', name: '06_Backups' }] } : { action: 'cancel' },
          ),
      };
    }
  }
  const google = {
    accounts: {
      id: identity,
      oauth2: {
        initTokenClient(options: { callback: (response: { access_token: string; expires_in: number }) => void }) {
          return { requestAccessToken: () => options.callback({ access_token: 'drive-token-test-only', expires_in: 3600 }) };
        },
        hasGrantedAllScopes: () => true,
      },
    },
    picker: {
      ViewId: { FOLDERS: 'folders' },
      DocsViewMode: { LIST: 'list' },
      Action: { PICKED: 'picked', CANCEL: 'cancel' },
      DocsView: FakeDocsView,
      PickerBuilder: FakePickerBuilder,
    },
  };
  Object.defineProperty(window, 'google', { configurable: true, value: google });
  Object.defineProperty(window, 'gapi', { configurable: true, value: {} });
}

export async function initializeWithLegacySession() {
  localStorage.setItem(LEGACY_KEY, '{"legacy":"preserve-me"}');
  const bootstrap = await initializeLearningStorage();
  const migration = await queueLegacyMigration();
  const pending = await (await getLearningDb()).getAll('outbox');
  await storeServerEvents(pending.map((record, index) => ({ seq: index + 1, event: record.event })));
  const verified = await verifyLegacyMigrationOnServer();
  return { bootstrap, migration, verified };
}

export async function establishTestGoogleIdentitySession() {
  commitGoogleIdToken(TEST_ID_TOKEN);
  await exchangeIdTokenForWorkerSession(TEST_ID_TOKEN);
}

beforeEach(async () => {
  localStorage.clear();
  await resetLearningDbForTests();
  vi.mocked(permittedAccount).mockResolvedValue(true);
  setDefaultSyncRuntime(new BrowserSyncRuntime());
  // Keep Worker session exchange out of the Drive request counts asserted below.
  await resetWorkerSessionForTests({
    fetcher: (async () =>
      Response.json(
        { sessionToken: TEST_WORKER_SESSION, expiresAt: Date.now() + 7 * 24 * 60 * 60_000 },
        { status: 201 },
      )) as unknown as typeof fetch,
  });
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearGoogleIdToken();
  delete (window as Window & { google?: unknown; gapi?: unknown }).google;
  delete (window as Window & { gapi?: unknown }).gapi;
  setDefaultSyncRuntime(new BrowserSyncRuntime());
  await resetLearningDbForTests();
  await resetWorkerSessionForTests();
  localStorage.clear();
});
