import type { LegacyMigration } from './browser-db';
import { driveError } from '../features/drive-bank/drive-bank';

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

export type DriveBackupResult = { id: string; name: string; parentId: string };

/** Create a private JSON file in the folder explicitly selected by the owner, then read it back byte-for-byte. */
export async function createVerifiedDriveBackup(token: string, folder: { id: string; name: string }, migration: LegacyMigration, contents: string): Promise<DriveBackupResult> {
  if (!token || !folder.id || !contents) throw new Error('Google Drive authorization and a backup folder are required.');
  const boundary = `mathscratchpad_${crypto.randomUUID().replace(/-/g, '')}`;
  const name = `MathScratchpad-Learning-Migration-${migration.id.slice(0, 8)}.json`;
  const metadata = JSON.stringify({
    name,
    mimeType: 'application/json',
    parents: [folder.id],
    description: 'Private Math Scratchpad learning-data migration backup. Do not share publicly.',
  });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${contents}\r\n`,
    `--${boundary}--`,
  ], { type: `multipart/related; boundary=${boundary}` });
  const created = await fetch(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,mimeType,parents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': body.type },
    body,
  });
  if (!created.ok) throw driveError(created.status, 'Creating the private learning backup in Drive');
  const file: unknown = await created.json();
  if (!file || typeof file !== 'object' || Array.isArray(file)) throw new Error('Google Drive returned invalid backup metadata.');
  const record = file as Record<string, unknown>;
  if (typeof record.id !== 'string' || record.name !== name || record.mimeType !== 'application/json' || !Array.isArray(record.parents) || !record.parents.includes(folder.id)) {
    throw new Error('The Drive backup was created in an unexpected location; old browser data was not cleared.');
  }
  const download = await fetch(`${DRIVE_API}/${encodeURIComponent(record.id)}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
  if (!download.ok) throw driveError(download.status, 'Verifying the learning backup in Drive');
  if (await download.text() !== contents) throw new Error('The Drive backup content did not match the source; old browser data was not cleared.');
  return { id: record.id, name, parentId: folder.id };
}
