import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SyncPanel } from '../../../src/sync/sync-panel';
import { initializeLearningStorage, readLegacyMigration } from '../../../src/sync/browser-db';
import { markLegacyMigrationDriveVerified, queueLegacyMigration, verifyLegacyMigrationOnServer } from '../../../src/sync/legacy-migration';
import { permittedAccount } from '../../../src/features/drive-bank/identity';
import { LEGACY_KEY, installGooglePicker, initializeWithLegacySession, establishTestGoogleIdentitySession } from '../../helpers/sync-panel';
vi.mock('../../../src/features/drive-bank/identity', () => ({ permittedAccount: vi.fn() }));

describe('backup errors', () => {
  it('keeps legacy data and never uploads when the selected backup folder is shared', async () => {
    await initializeWithLegacySession();
    installGooglePicker();
    await establishTestGoogleIdentitySession();
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
      String(input).includes('/oauth2/v3/userinfo')
        ? Response.json({ email: 'owner@example.test', email_verified: true })
        : Response.json({
            id: 'backup-folder',
            mimeType: 'application/vnd.google-apps.folder',
            ownedByMe: true,
            shared: true,
            capabilities: { canAddChildren: true },
          }),
    );
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
    await establishTestGoogleIdentitySession();
    vi.mocked(permittedAccount).mockResolvedValue(false);
    const fetcher = vi.fn(async () => Response.json({ email: 'different@example.test', email_verified: true }));
    vi.stubGlobal('fetch', fetcher);
    render(<SyncPanel />);

    await userEvent.click(await screen.findByRole('button', { name: 'پشتیبان‌گیری در Drive و پایان مهاجرت' }));
    expect((await screen.findByRole('alert')).textContent).toContain('حساب Google Drive با حساب واردشده یکی نیست');
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
