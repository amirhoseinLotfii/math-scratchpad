import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserSyncRuntime, setDefaultSyncRuntime } from '../../src/sync/runtime';
import { SyncPanel } from '../../src/sync/sync-panel';

// Ensure Node.js webcrypto is available as globalThis.crypto for tests
// In jsdom, globalThis.crypto is a getter-only property, so we need to redefine it
Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
  writable: true,
  configurable: true,
  enumerable: true
});
import {
  getLearningDb,
  initializeLearningStorage,
  readLegacyMigration,
  resetLearningDbForTests,
  storeServerEvents,
} from '../../src/sync/browser-db';
import { legacyMigrationBackupContents, markLegacyMigrationDriveVerified, queueLegacyMigration, verifyLegacyMigrationOnServer } from '../../src/sync/legacy-migration';
import { permittedAccount } from '../../src/features/drive-bank/identity';

vi.mock('../../src/features/drive-bank/identity', () => ({ permittedAccount: vi.fn() }));

const LEGACY_KEY = 'math-scratchpad-session-v3';

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function installGooglePicker(action: 'picked' | 'cancel' = 'picked') {
  let idCallback: ((response: { credential?: string }) => void) | undefined;
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const identity = {
    initialize(options: { callback: (response: { credential?: string }) => void }) { idCallback = options.callback; },
    renderButton(element: HTMLElement) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = 'Sign in with Google'; button.setAttribute('aria-label', 'Sign in with Google');
      button.addEventListener('click', () => idCallback?.({ credential: `header.${payload}.signature` }));
      element.replaceChildren(button);
    },
  };
  class FakeDocsView {
    setSelectFolderEnabled() { return this; }
    setMode() { return this; }
  }
  class FakePickerBuilder {
    private callback?: (result: { action: string; docs?: Array<{ id: string; name: string }> }) => void;
    addView() { return this; }
    setOAuthToken() { return this; }
    setDeveloperKey() { return this; }
    setAppId() { return this; }
    setOrigin() { return this; }
    setLocale() { return this; }
    setTitle() { return this; }
    setCallback(callback: (result: { action: string; docs?: Array<{ id: string; name: string }> }) => void) { this.callback = callback; return this; }
    build() {
      return { setVisible: () => this.callback?.(action === 'picked'
        ? { action: 'picked', docs: [{ id: 'backup-folder', name: '06_Backups' }] }
        : { action: 'cancel' }) };
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
    picker: { ViewId: { FOLDERS: 'folders' }, DocsViewMode: { LIST: 'list' }, Action: { PICKED: 'picked', CANCEL: 'cancel' }, DocsView: FakeDocsView, PickerBuilder: FakePickerBuilder },
  };
  Object.defineProperty(window, 'google', { configurable: true, value: google });
  Object.defineProperty(window, 'gapi', { configurable: true, value: {} });
}

async function initializeWithLegacySession() {
  localStorage.setItem(LEGACY_KEY, '{"legacy":"preserve-me"}');
  const bootstrap = await initializeLearningStorage();
  const migration = await queueLegacyMigration();
  const pending = await (await getLearningDb()).getAll('outbox');
  await storeServerEvents(pending.map((record, index) => ({ seq: index + 1, event: record.event })));
  const verified = await verifyLegacyMigrationOnServer();
  return { bootstrap, migration, verified };
}

beforeEach(async () => {
  localStorage.clear();
  await resetLearningDbForTests();
  vi.mocked(permittedAccount).mockResolvedValue(true);
  setDefaultSyncRuntime(new BrowserSyncRuntime());
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (window as Window & { google?: unknown; gapi?: unknown }).google;
  delete (window as Window & { gapi?: unknown }).gapi;
  setDefaultSyncRuntime(new BrowserSyncRuntime());
  await resetLearningDbForTests();
  localStorage.clear();
});

describe('sync and migration panel', () => {
  it('traps keyboard focus in the floating inspector and restores the menu trigger after closing', async () => {
    await initializeLearningStorage();
    installGooglePicker();
    const trigger = document.createElement('button');
    trigger.textContent = 'Open sync';
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const { unmount } = render(<SyncPanel onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'همگام‌سازی و حفظ داده‌ها' });
    const close = within(dialog).getByRole('button', { name: 'بستن تنظیم همگام‌سازی' });
    expect(document.activeElement).toBe(close);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.body.style.overflow).toBe('hidden');
    await userEvent.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    trigger.focus();
    await userEvent.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe('');
    trigger.remove();
  });

  it('sends one explicitly classified synthetic event only when both mirrors are ready', async () => {
    await initializeLearningStorage();
    installGooglePicker();
    const sent: Array<Record<string, unknown>> = [];
    const mirror = { status: 'synced', pendingCount: 0, quarantinedCount: 0, lastSyncedAt: null, lastError: null };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      if (url.pathname === '/sync') return Response.json({ events: [], cursor: 0, through: 0, hasMore: false });
      if (url.pathname === '/drive/status' || url.pathname === '/notion/status') return Response.json(mirror);
      if (url.pathname === '/events') {
        const body = JSON.parse(String(init?.body)) as { events: Array<Record<string, unknown>> };
        sent.push(...body.events);
        return Response.json({ events: body.events.map((event, index) => ({ id: event.id, seq: index + 1 })) });
      }
      if (url.pathname === '/drive/sync') return Response.json({ drive: mirror });
      if (url.pathname === '/notion/sync') return Response.json({ notion: mirror });
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher });
    setDefaultSyncRuntime(runtime);
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await runtime.syncNow();
    render(<SyncPanel />);
    const button = screen.getByRole('button', { name: 'تست امن اتصال Drive و Notion' });
    await vi.waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(button);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ isTest: true, bankVersion: 'sync-test-v1', lesson: 'sync-verification' });
    await vi.waitFor(() => {
      expect(fetcher.mock.calls.some(([input]) => new URL(String(input)).pathname === '/drive/sync')).toBe(true);
      expect(fetcher.mock.calls.some(([input]) => new URL(String(input)).pathname === '/notion/sync')).toBe(true);
    });
    runtime.stop();
  });

  it('shows separate server, Drive, and Notion status and manually syncs configured mirrors', async () => {
    await initializeLearningStorage();
    installGooglePicker();
    const paths: Array<{ path: string; method: string }> = [];
    let drive = { status: 'pending', pendingCount: 3, quarantinedCount: 2, lastSyncedAt: '2026-11-02T01:00:00.000Z', lastError: null };
    const notion = { status: 'not_configured', pendingCount: 4, quarantinedCount: 0, lastSyncedAt: null, lastError: null };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input)), method = init?.method ?? 'GET';
      paths.push({ path: url.pathname, method });
      if (url.pathname === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      if (url.pathname === '/sync') return Response.json({ events: [], cursor: 0, through: 0, hasMore: false });
      if (url.pathname === '/drive/status') return Response.json(drive);
      if (url.pathname === '/notion/status') return Response.json(notion);
      if (url.pathname === '/drive/sync' && method === 'POST') {
        drive = { status: 'synced', pendingCount: 0, quarantinedCount: 2, lastSyncedAt: '2026-11-02T01:15:00.000Z', lastError: null };
        return Response.json({ drive });
      }
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher });
    setDefaultSyncRuntime(runtime);
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await runtime.syncNow();

    render(<SyncPanel />);
    const driveStatus = screen.getByRole('group', { name: 'وضعیت Google Drive' });
    const notionStatus = screen.getByRole('group', { name: 'وضعیت Notion' });
    expect(within(screen.getByRole('group', { name: 'وضعیت سرور' })).getByText('همگام‌شده با سرور')).toBeTruthy();
    expect(await within(driveStatus).findByText('در صف ارسال')).toBeTruthy();
    expect(await within(driveStatus).findByText('3 رویداد در صف')).toBeTruthy();
    expect(await within(driveStatus).findByText('2 رویداد بدون برچسب قرنطینه شد و ارسال نشد.')).toBeTruthy();
    expect(await within(notionStatus).findByText('راه‌اندازی نشده')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'تست امن اتصال Drive و Notion' }) as HTMLButtonElement).disabled).toBe(true);
    expect(await within(notionStatus).findByText('4 رویداد در صف')).toBeTruthy();
    expect(await within(notionStatus).findByText('رویداد بدون برچسبی برای قرنطینه وجود ندارد.')).toBeTruthy();

    const syncDetails = screen.getByText('جزئیات آخرین همگام‌سازی و خطاها').closest('details');
    expect(syncDetails).not.toBeNull();
    await userEvent.click(syncDetails!.querySelector('summary')!);
    expect(within(syncDetails!).getAllByText('هنوز همگام نشده').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'همگام‌سازی الان' }));
    await vi.waitFor(() => expect(within(driveStatus).getByText('همگام‌شده')).toBeTruthy());
    expect(paths).toContainEqual({ path: '/drive/sync', method: 'POST' });
    expect(paths).not.toContainEqual({ path: '/notion/sync', method: 'POST' });
    runtime.stop();
  });

  it('announces current sync status and returns focus through its close action', async () => {
    await initializeLearningStorage();
    const onClose = vi.fn();
    installGooglePicker();
    render(<SyncPanel onClose={onClose} />);
    expect(await screen.findByRole('heading', { name: 'همگام‌سازی و حفظ داده‌ها' })).toBeTruthy();
    expect(screen.getByText('آمادهٔ همگام‌سازی').getAttribute('role')).toBe('status');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    await userEvent.click(screen.getByRole('button', { name: 'بستن تنظیم همگام‌سازی' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backs up only after server verification, reads the Drive file back, then clears the exact old key', async () => {
    const { verified } = await initializeWithLegacySession();
    expect(verified.status).toBe('server-verified');
    installGooglePicker();
    const expectedContents = legacyMigrationBackupContents(verified);
    let uploadedContent = '';
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (String(_input).includes('/oauth2/v3/userinfo')) return Response.json({ email: 'owner@example.test', email_verified: true });
      if (String(_input).includes('/drive/v3/files/backup-folder?')) return Response.json({
        id: 'backup-folder', mimeType: 'application/vnd.google-apps.folder', ownedByMe: true, shared: false, permissions: [{ type: 'user', role: 'owner' }], capabilities: { canAddChildren: true },
      });
      if (String(_input).startsWith('https://www.googleapis.com/drive/v3/files?')) return Response.json({ files: [] });
      if (init?.method === 'POST') {
        const multipart = await readBlob(init.body as Blob);
        expect(multipart).toContain(expectedContents);
        expect(multipart).toContain('"parents":["backup-folder"]');
        uploadedContent = expectedContents;
        return Response.json({
          id: 'backup-file-id',
          name: `MathScratchpad-Learning-Migration-${verified.id.slice(0, 8)}.json`,
          mimeType: 'application/json',
          parents: ['backup-folder'],
        });
      }
      return new Response(uploadedContent, { status: 200 });
    });
    vi.stubGlobal('fetch', fetcher);
    render(<SyncPanel />);

    const backupButton = await screen.findByRole('button', { name: 'پشتیبان‌گیری در Drive و پایان مهاجرت' });
    await userEvent.click(backupButton);
    await screen.findByText(/در پوشهٔ «06_Backups» ساخته و خواندن دوباره‌اش تأیید شد/);

    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect((await readLegacyMigration())?.status).toBe('complete');
    expect(screen.getByRole('button', { name: 'Sign in with Google' }).isConnected).toBe(true);
  });

  it('preserves the old key when the owner cancels Drive folder selection', async () => {
    const { verified } = await initializeWithLegacySession();
    installGooglePicker('cancel');
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).includes('/oauth2/v3/userinfo')
      ? Response.json({ email: 'owner@example.test', email_verified: true })
      : new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetcher);
    render(<SyncPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'پشتیبان‌گیری در Drive و پایان مهاجرت' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/canceled/i);
    expect(localStorage.getItem(LEGACY_KEY)).toBe('{"legacy":"preserve-me"}');
    expect((await readLegacyMigration())?.status).toBe('server-verified');
    expect(verified.status).toBe('server-verified');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain('/oauth2/v3/userinfo');
  });

  it('reuses an uploaded backup after read-back failure and preserves legacy data until verification', async () => {
    const { verified } = await initializeWithLegacySession();
    installGooglePicker();
    const contents = legacyMigrationBackupContents(verified);
    const metadata = { id: 'backup-file-id', name: `MathScratchpad-Learning-Migration-${verified.id.slice(0, 8)}.json`, mimeType: 'application/json', parents: ['backup-folder'] };
    let uploaded = false;
    let downloads = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/oauth2/v3/userinfo')) return Response.json({ email: 'owner@example.test', email_verified: true });
      if (url.includes('/drive/v3/files/backup-folder?')) return Response.json({ id: 'backup-folder', mimeType: 'application/vnd.google-apps.folder', ownedByMe: true, shared: false, permissions: [{ type: 'user', role: 'owner' }], capabilities: { canAddChildren: true } });
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?')) return Response.json({ files: uploaded ? [metadata] : [] });
      if (init?.method === 'POST') { uploaded = true; return Response.json(metadata); }
      downloads += 1;
      return downloads === 1 ? new Response('{}', { status: 503 }) : new Response(contents, { status: 200 });
    });
    vi.stubGlobal('fetch', fetcher);
    render(<SyncPanel />);

    await userEvent.click(await screen.findByRole('button', { name: 'پشتیبان‌گیری در Drive و پایان مهاجرت' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/temporarily unavailable/i);
    expect(localStorage.getItem(LEGACY_KEY)).toBe('{"legacy":"preserve-me"}');
    expect((await readLegacyMigration())?.status).toBe('server-verified');

    await userEvent.click(screen.getByRole('button', { name: 'پشتیبان‌گیری در Drive و پایان مهاجرت' }));
    expect(await screen.findByText(/خواندن دوباره‌اش تأیید شد/)).toBeTruthy();
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect((await readLegacyMigration())?.status).toBe('complete');
  });

  it('keeps legacy data and never uploads when the selected backup folder is shared', async () => {
    await initializeWithLegacySession();
    installGooglePicker();
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => String(input).includes('/oauth2/v3/userinfo')
      ? Response.json({ email: 'owner@example.test', email_verified: true })
      : Response.json({ id: 'backup-folder', mimeType: 'application/vnd.google-apps.folder', ownedByMe: true, shared: true, capabilities: { canAddChildren: true } }));
    vi.stubGlobal('fetch', fetcher);
    render(<SyncPanel />);

    await userEvent.click(await screen.findByRole('button', { name: 'پشتیبان‌گیری در Drive و پایان مهاجرت' }));
    expect((await screen.findByRole('alert')).textContent).toContain('پوشهٔ پشتیبان باید خصوصی');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
    expect(localStorage.getItem(LEGACY_KEY)).toBe('{"legacy":"preserve-me"}');
    expect((await readLegacyMigration())?.status).toBe('server-verified');
  });

  it('refuses to upload a private backup when the selected Drive account is not the project owner', async () => {
    const { verified } = await initializeWithLegacySession();
    installGooglePicker();
    vi.mocked(permittedAccount).mockResolvedValue(false);
    const fetcher = vi.fn(async () => Response.json({ email: 'different@example.test', email_verified: true }));
    vi.stubGlobal('fetch', fetcher);
    render(<SyncPanel />);

    await userEvent.click(await screen.findByRole('button', { name: 'پشتیبان‌گیری در Drive و پایان مهاجرت' }));
    expect((await screen.findByRole('alert')).textContent).toContain('حساب Google Drive با حساب مجاز پروژه تطبیق ندارد');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(LEGACY_KEY)).toBe('{"legacy":"preserve-me"}');
    expect((await readLegacyMigration())?.status).toBe('server-verified');
    expect(verified.status).toBe('server-verified');
  });

  it('offers an explicit cleanup retry after a verified Drive backup and preserves the browser copy until then', async () => {
    const { verified } = await initializeWithLegacySession();
    const backedUp = await markLegacyMigrationDriveVerified(verified, { id: 'backup-file-id', name: 'migration.json' });
    installGooglePicker();
    render(<SyncPanel />);

    expect(await screen.findByText(/پشتیبان Drive تأیید شده است/)).toBeTruthy();
    expect((await readLegacyMigration())?.status).toBe('drive-backed-up');
    await userEvent.click(screen.getByRole('button', { name: 'پاک‌کردن ایمن کلیدهای قدیمی' }));
    expect(await screen.findByText(/پس از تأیید سرور و پشتیبان Drive پاک شد/)).toBeTruthy();
    expect((await readLegacyMigration())?.status).toBe('complete');
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(backedUp.status).toBe('drive-backed-up');
  });

  it('keeps old values and explains that a queued migration still needs server confirmation', async () => {
    localStorage.setItem(LEGACY_KEY, '{"legacy":"preserve-me"}');
    await initializeLearningStorage();
    installGooglePicker();
    render(<SyncPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'ارسال و راستی‌آزمایی داده‌های قدیمی' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/not confirmed every migration chunk/i);
    expect((await readLegacyMigration())?.status).toBe('pending');
    expect(localStorage.getItem(LEGACY_KEY)).toBe('{"legacy":"preserve-me"}');
  });

  it('shows a recoverable Google identity setup error without dropping existing progress', async () => {
    localStorage.setItem(LEGACY_KEY, '{"legacy":"preserve-me"}');
    await initializeLearningStorage();
    Object.defineProperty(window, 'google', { configurable: true, value: { accounts: { oauth2: {} } } });
    render(<SyncPanel />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/ورود امن گوگل/);
    expect(localStorage.getItem(LEGACY_KEY)).toBe('{"legacy":"preserve-me"}');
  });

  it('does not let an incomplete server migration delete prior values', async () => {
    localStorage.setItem(LEGACY_KEY, '{"legacy":"preserve-me"}');
    await initializeLearningStorage();
    const queued = await queueLegacyMigration();
    await expect(verifyLegacyMigrationOnServer()).rejects.toThrow(/not confirmed every migration chunk/);
    expect(queued?.status).toBe('pending');
    expect(localStorage.getItem(LEGACY_KEY)).toBe('{"legacy":"preserve-me"}');
  });
});
