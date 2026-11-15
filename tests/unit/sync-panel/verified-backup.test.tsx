import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SyncPanel } from '../../../src/sync/sync-panel';
import { readLegacyMigration } from '../../../src/sync/browser-db';
import { legacyMigrationBackupContents } from '../../../src/sync/legacy-migration';
import {
  LEGACY_KEY,
  readBlob,
  installGooglePicker,
  initializeWithLegacySession,
  establishTestGoogleIdentitySession,
} from '../../helpers/sync-panel';
vi.mock('../../../src/features/drive-bank/identity', () => ({ permittedAccount: vi.fn() }));

describe('verified backup', () => {
  it('backs up only after server verification, reads the Drive file back, then clears the exact old key', async () => {
    const { verified } = await initializeWithLegacySession();
    expect(verified.status).toBe('server-verified');
    installGooglePicker();
    await establishTestGoogleIdentitySession();
    const expectedContents = legacyMigrationBackupContents(verified);
    let uploadedContent = '';
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (String(_input).includes('/oauth2/v3/userinfo')) return Response.json({ email: 'owner@example.test', email_verified: true });
      if (String(_input).includes('/drive/v3/files/backup-folder?'))
        return Response.json({
          id: 'backup-folder',
          mimeType: 'application/vnd.google-apps.folder',
          ownedByMe: true,
          shared: false,
          permissions: [{ type: 'user', role: 'owner' }],
          capabilities: { canAddChildren: true },
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
    await establishTestGoogleIdentitySession();
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/oauth2/v3/userinfo')
        ? Response.json({ email: 'owner@example.test', email_verified: true })
        : new Response('', { status: 404 }),
    );
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
    await establishTestGoogleIdentitySession();
    const contents = legacyMigrationBackupContents(verified);
    const metadata = {
      id: 'backup-file-id',
      name: `MathScratchpad-Learning-Migration-${verified.id.slice(0, 8)}.json`,
      mimeType: 'application/json',
      parents: ['backup-folder'],
    };
    let uploaded = false;
    let downloads = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/oauth2/v3/userinfo')) return Response.json({ email: 'owner@example.test', email_verified: true });
      if (url.includes('/drive/v3/files/backup-folder?'))
        return Response.json({
          id: 'backup-folder',
          mimeType: 'application/vnd.google-apps.folder',
          ownedByMe: true,
          shared: false,
          permissions: [{ type: 'user', role: 'owner' }],
          capabilities: { canAddChildren: true },
        });
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?')) return Response.json({ files: uploaded ? [metadata] : [] });
      if (init?.method === 'POST') {
        uploaded = true;
        return Response.json(metadata);
      }
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
});
