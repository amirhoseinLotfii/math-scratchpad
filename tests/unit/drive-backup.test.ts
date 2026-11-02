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
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(uploaded[0].input).toContain('/upload/drive/v3/files?uploadType=multipart');
    expect((uploaded[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer temporary-test-token');
    const multipart = await readBlob(uploaded[0].init?.body as Blob);
    expect(multipart).toContain('"parents":["chosen-folder"]');
    expect(multipart).toContain('Do not share publicly.');
    expect(multipart).toContain(content);
    expect(uploaded[1].input).toBe('https://www.googleapis.com/drive/v3/files/drive-backup-1?alt=media');
    expect((uploaded[1].init?.headers as Record<string, string>).Authorization).toBe('Bearer temporary-test-token');
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
    const fetcher = vi.fn(async () => Response.json({
      id: 'wrong-location',
      name: 'MathScratchpad-Learning-Migration-d23a8da1.json',
      mimeType: 'application/json',
      parents: ['other-folder'],
    }));
    vi.stubGlobal('fetch', fetcher);
    await expect(createVerifiedDriveBackup('token', { id: 'chosen-folder', name: '06_Backups' }, migration, '{}')).rejects.toThrow(/unexpected location/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects a read-back mismatch so the caller can retain the old browser keys', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === 'POST'
      ? Response.json({ id: 'backup', name: 'MathScratchpad-Learning-Migration-d23a8da1.json', mimeType: 'application/json', parents: ['folder'] })
      : new Response('tampered', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(createVerifiedDriveBackup('token', { id: 'folder', name: '06_Backups' }, migration, 'expected')).rejects.toThrow(/did not match/);
  });

  it('surfaces Drive permission and transient service failures without cleanup', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })));
    await expect(createVerifiedDriveBackup('token', { id: 'folder', name: '06_Backups' }, migration, '{}')).rejects.toThrow(/denied access/);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    await expect(createVerifiedDriveBackup('token', { id: 'folder', name: '06_Backups' }, migration, '{}')).rejects.toThrow(/temporarily unavailable/);
  });
});
