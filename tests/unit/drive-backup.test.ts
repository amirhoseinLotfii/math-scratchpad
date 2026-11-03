import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LegacyMigration } from '../../src/sync/browser-db';
import { createVerifiedDriveBackup } from '../../src/sync/drive-backup';

const migration: LegacyMigration = {
  id: 'd23a8da1-7d31-4aa7-b0c3-80ea4df076b7',
  createdAt: '2026-11-02T00:00:00.000Z',
  entries: [{ key: 'math-scratchpad-session-v3', value: '{"ok":true}', sha256: 'a'.repeat(64) }],
  eventIds: ['d23a8da1-7d31-4aa7-b0c3-80ea4df076b7'],
  status: 'server-verified',
  serverVerifiedAt: '2026-11-02T00:01:00.000Z',
};

afterEach(() => { vi.unstubAllGlobals(); });

function privateFolder(id: string) {
  return { id, mimeType: 'application/vnd.google-apps.folder', ownedByMe: true, shared: false, permissions: [{ type: 'user', role: 'owner' }], capabilities: { canAddChildren: true } };
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('private Google Drive migration backup', () => {
  it('creates a private JSON in the selected folder and verifies the exact uploaded bytes', async () => {
    const content = JSON.stringify({ migrationId: migration.id, entries: migration.entries });
    const uploaded: Array<{ input: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      uploaded.push({ input: url, init });
      if (url.includes('/files/chosen-folder?')) return Response.json(privateFolder('chosen-folder'));
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?')) return Response.json({ files: [] });
      if (init?.method === 'POST') return Response.json({
        id: 'drive-backup-1',
        name: 'MathScratchpad-Learning-Migration-d23a8da1.json',
        mimeType: 'application/json',
        parents: ['chosen-folder'],
      });
      return new Response(content, { status: 200 });
    });
    vi.stubGlobal('fetch', fetcher);

    const result = await createVerifiedDriveBackup('temporary-test-token', { id: 'chosen-folder', name: '06_Backups' }, migration, content);

    expect(result).toEqual({ id: 'drive-backup-1', name: 'MathScratchpad-Learning-Migration-d23a8da1.json', parentId: 'chosen-folder' });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(uploaded[0].input).toContain('/files/chosen-folder?');
    expect(uploaded[1].input).toContain('/drive/v3/files?');
    expect(uploaded[2].input).toContain('/upload/drive/v3/files?uploadType=multipart');
    expect((uploaded[2].init?.headers as Record<string, string>).Authorization).toBe('Bearer temporary-test-token');
    const multipart = await readBlob(uploaded[2].init?.body as Blob);
    expect(multipart).toContain('"parents":["chosen-folder"]');
    expect(multipart).toContain('Do not share publicly.');
    expect(multipart).toContain(content);
    expect(uploaded[3].input).toBe('https://www.googleapis.com/drive/v3/files/drive-backup-1?alt=media');
    expect((uploaded[3].init?.headers as Record<string, string>).Authorization).toBe('Bearer temporary-test-token');
  });

  it('rejects missing authorization, folder, or content without making a request', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(createVerifiedDriveBackup('', { id: 'folder', name: 'Folder' }, migration, '{}')).rejects.toThrow(/authorization/);
    await expect(createVerifiedDriveBackup('token', { id: '', name: 'Folder' }, migration, '{}')).rejects.toThrow(/folder/);
    await expect(createVerifiedDriveBackup('token', { id: 'folder', name: 'Folder' }, migration, '')).rejects.toThrow(/folder/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('stops when the new file metadata points outside the selected folder', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => String(input).includes('/files/chosen-folder?') ? Response.json(privateFolder('chosen-folder')) : init?.method !== 'POST' ? Response.json({ files: [] }) : Response.json({
      id: 'wrong-location',
      name: 'MathScratchpad-Learning-Migration-d23a8da1.json',
      mimeType: 'application/json',
      parents: ['other-folder'],
    }));
    vi.stubGlobal('fetch', fetcher);
    await expect(createVerifiedDriveBackup('token', { id: 'chosen-folder', name: '06_Backups' }, migration, '{}')).rejects.toThrow(/unexpected location/);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('rejects a read-back mismatch so the caller can retain the old browser keys', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => String(input).includes('/files/folder?')
      ? Response.json(privateFolder('folder')) : String(input).startsWith('https://www.googleapis.com/drive/v3/files?') ? Response.json({ files: [] }) : init?.method === 'POST'
      ? Response.json({ id: 'backup', name: 'MathScratchpad-Learning-Migration-d23a8da1.json', mimeType: 'application/json', parents: ['folder'] })
      : new Response('tampered', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(createVerifiedDriveBackup('token', { id: 'folder', name: '06_Backups' }, migration, 'expected')).rejects.toThrow(/did not match/);
  });

  it.each([
    ['shared folder', { ...privateFolder('folder'), shared: true }],
    ['shared drive', { ...privateFolder('folder'), driveId: 'shared-drive' }],
    ['not owned', { ...privateFolder('folder'), ownedByMe: false }],
    ['unknown sharing', { ...privateFolder('folder'), shared: undefined }],
    ['public permission despite a private flag', { ...privateFolder('folder'), permissions: [{ type: 'user', role: 'owner' }, { type: 'anyone', role: 'reader' }] }],
    ['unknown permissions', { ...privateFolder('folder'), permissions: undefined }],
    ['deleted owner', { ...privateFolder('folder'), permissions: [{ type: 'user', role: 'owner', deleted: true }] }],
    ['not writable', { ...privateFolder('folder'), capabilities: { canAddChildren: false } }],
    ['wrong type', { ...privateFolder('folder'), mimeType: 'application/json' }],
    ['wrong id', privateFolder('different-folder')],
  ])('does not upload learning data to a %s', async (_label, metadata) => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json(metadata));
    vi.stubGlobal('fetch', fetcher);
    await expect(createVerifiedDriveBackup('token', { id: 'folder', name: 'Folder' }, migration, '{}')).rejects.toThrow(/خصوصی/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
  });

  it('reuses a verified prior upload after an interrupted response without creating another file', async () => {
    const metadata = { id: 'existing', name: 'MathScratchpad-Learning-Migration-d23a8da1.json', mimeType: 'application/json', parents: ['folder'] };
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/files/folder?')) return Response.json(privateFolder('folder'));
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?')) return Response.json({ files: [metadata] });
      return new Response('expected', { status: 200 });
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(createVerifiedDriveBackup('token', { id: 'folder', name: 'Folder' }, migration, 'expected')).resolves.toMatchObject({ id: 'existing' });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
  });

  it('does not overwrite or duplicate an existing backup whose content differs', async () => {
    const metadata = { id: 'existing', name: 'MathScratchpad-Learning-Migration-d23a8da1.json', mimeType: 'application/json', parents: ['folder'] };
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/files/folder?')) return Response.json(privateFolder('folder'));
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?')) return Response.json({ files: [metadata] });
      return new Response('different', { status: 200 });
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(createVerifiedDriveBackup('token', { id: 'folder', name: 'Folder' }, migration, 'expected')).rejects.toThrow(/did not match/);
    expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
  });

  it('does not upload when searching for a prior backup is denied', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => String(input).includes('/files/folder?')
      ? Response.json(privateFolder('folder')) : new Response('{}', { status: 403 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(createVerifiedDriveBackup('token', { id: 'folder', name: 'Folder' }, migration, '{}')).rejects.toThrow(/denied access/);
    expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
  });

  it.each([
    ['multiple files', { files: [{ id: 'a' }, { id: 'b' }] }],
    ['an additional page', { files: [], nextPageToken: 'next' }],
    ['an incomplete search', { files: [], incompleteSearch: true }],
    ['a malformed listing', {}],
  ])('does not create a backup when the search returns %s', async (_label, listing) => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => String(input).includes('/files/folder?')
      ? Response.json(privateFolder('folder')) : Response.json(listing));
    vi.stubGlobal('fetch', fetcher);
    await expect(createVerifiedDriveBackup('token', { id: 'folder', name: 'Folder' }, migration, '{}')).rejects.toThrow(/قابل تأیید نیست/);
    expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
  });

  it('surfaces Drive permission and transient service failures without cleanup', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })));
    await expect(createVerifiedDriveBackup('token', { id: 'folder', name: '06_Backups' }, migration, '{}')).rejects.toThrow(/denied access/);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    await expect(createVerifiedDriveBackup('token', { id: 'folder', name: '06_Backups' }, migration, '{}')).rejects.toThrow(/temporarily unavailable/);
  });
});
