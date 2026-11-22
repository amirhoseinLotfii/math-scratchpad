import type { DriveBank, DriveMeta } from '../../../domain/entities/drive-bank.types';
import { driveError } from '../../../shared/lib/drive-error';
import { EMPTY_BANK, parseBankText } from '../model/bank-validator';

export { driveError };
const validFileId = (id: string) => /^[A-Za-z0-9_-]{10,150}$/.test(id);

/** Cheap metadata request used for change detection; content is downloaded only when this changes. */
export async function readDriveMeta(fileId: string, token: string): Promise<DriveMeta> {
  if (!validFileId(fileId)) throw Error('Invalid Google Drive file ID.');
  const fields = 'id,name,mimeType,size,md5Checksum,modifiedTime,headRevisionId,version,trashed';
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${fields}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) throw driveError(response.status, 'Reading file metadata');
  const meta = await response.json() as DriveMeta;
  if (meta.trashed) throw Error('The bank file is in the Google Drive trash.');
  if (meta.mimeType === 'application/vnd.google-apps.document') throw Error('The bank file is a Google Doc. Select a regular .json file.');
  return meta;
}

/** Fingerprint of Drive metadata; any content edit changes md5Checksum/headRevisionId/version. */
export function metaFingerprint(meta: DriveMeta): string {
  return [meta.id, meta.md5Checksum ?? '', meta.headRevisionId ?? '', meta.version ?? '', meta.size ?? '', meta.modifiedTime ?? ''].join('|');
}

export async function readPrivateBankText(fileId: string, token: string): Promise<string> {
  if (!validFileId(fileId)) throw Error('Invalid Google Drive file ID.');
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) throw driveError(response.status, 'Reading the question bank');
  return response.text();
}

export async function readPrivateBank(fileId: string, token: string): Promise<DriveBank | typeof EMPTY_BANK> {
  return parseBankText(await readPrivateBankText(fileId, token));
}
