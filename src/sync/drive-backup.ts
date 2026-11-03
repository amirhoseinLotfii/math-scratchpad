import type { LegacyMigration } from './browser-db';
import { driveError } from '../features/drive-bank/drive-bank';

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

export type DriveBackupResult = { id: string; name: string; parentId: string };

/** Create a private JSON file in the folder explicitly selected by the owner, then read it back byte-for-byte. */
export async function createVerifiedDriveBackup(token: string, folder: { id: string; name: string }, migration: LegacyMigration, contents: string): Promise<DriveBackupResult> {
  if (!token || !folder.id || !contents) throw new Error('Google Drive authorization and a backup folder are required.');
  // Files inherit access from their parent folder. Fail closed before sending
  // learning data if the selected folder is shared or cannot be verified.
  const fields = new URLSearchParams({ fields: 'id,mimeType,ownedByMe,shared,driveId,permissions(type,role,deleted),capabilities(canAddChildren)' });
  const folderResponse = await fetch(`${DRIVE_API}/${encodeURIComponent(folder.id)}?${fields}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!folderResponse.ok) throw driveError(folderResponse.status, 'Checking the private backup folder in Drive');
  const folderData: unknown = await folderResponse.json().catch(() => null);
  const checked = folderData && typeof folderData === 'object' && !Array.isArray(folderData)
    ? folderData as Record<string, unknown> : null;
  const capabilities = checked?.capabilities && typeof checked.capabilities === 'object' && !Array.isArray(checked.capabilities)
    ? checked.capabilities as Record<string, unknown> : null;
  const permissions = checked?.permissions;
  const ownerOnly = Array.isArray(permissions) && permissions.length === 1
    && permissions[0] && typeof permissions[0] === 'object' && !Array.isArray(permissions[0])
    && permissions[0].type === 'user' && permissions[0].role === 'owner' && permissions[0].deleted !== true;
  if (!checked || checked.id !== folder.id || checked.mimeType !== 'application/vnd.google-apps.folder'
      || checked.ownedByMe !== true || checked.shared !== false || checked.driveId != null
      || capabilities?.canAddChildren !== true || !ownerOnly) {
    throw new Error('پوشهٔ پشتیبان باید خصوصی، متعلق به حساب شما و قابل نوشتن باشد؛ هیچ داده‌ای بارگذاری نشد.');
  }
  const name = `MathScratchpad-Learning-Migration-${migration.id.slice(0, 8)}.json`;
  const escapeQuery = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const query = new URLSearchParams({
    q: `'${escapeQuery(folder.id)}' in parents and name = '${escapeQuery(name)}' and trashed = false`,
    fields: 'nextPageToken,incompleteSearch,files(id,name,mimeType,parents)',
    pageSize: '2',
  });
  // A previous upload may have succeeded even if its response was lost.
  // Reuse it only after metadata and content read-back match exactly.
  const search = await fetch(`${DRIVE_API}?${query}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!search.ok) throw driveError(search.status, 'Checking existing learning backups in Drive');
  const found: unknown = await search.json().catch(() => null);
  const listing = found && typeof found === 'object' && !Array.isArray(found) ? found as Record<string, unknown> : null;
  if (!listing || !Array.isArray(listing.files) || listing.files.length > 1 || listing.nextPageToken || listing.incompleteSearch === true) {
    throw new Error('تعداد پشتیبان‌های موجود قابل تأیید نیست؛ هیچ فایل تازه‌ای ساخته نشد.');
  }
  const verifyRecord = async (file: unknown): Promise<DriveBackupResult> => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) throw new Error('Google Drive returned invalid backup metadata.');
    const record = file as Record<string, unknown>;
    if (typeof record.id !== 'string' || record.name !== name || record.mimeType !== 'application/json' || !Array.isArray(record.parents) || !record.parents.includes(folder.id)) {
      throw new Error('The Drive backup was created in an unexpected location; old browser data was not cleared.');
    }
    const download = await fetch(`${DRIVE_API}/${encodeURIComponent(record.id)}?alt=media`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!download.ok) throw driveError(download.status, 'Verifying the learning backup in Drive');
    if (await download.text() !== contents) throw new Error('The Drive backup content did not match the source; old browser data was not cleared.');
    return { id: record.id, name, parentId: folder.id };
  };
  if (listing.files.length === 1) return verifyRecord(listing.files[0]);

  const boundary = `mathscratchpad_${crypto.randomUUID().replace(/-/g, '')}`;
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
  return verifyRecord(await created.json());
}
