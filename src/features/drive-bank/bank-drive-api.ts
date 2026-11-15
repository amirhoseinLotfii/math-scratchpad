import { MAX_BANK_TEXT_CHARS } from '../../../shared/contracts/limits';
import { parse } from '../../parser';

import type { DriveBank } from './bank-types';
import { validateBank } from './validate-bank';

export function driveError(status: number, action: string): Error {
  if (status === 401) return Error('Google authorization expired. Reconnect to continue.');
  if (status === 403)
    return Error(`${action}: Google denied access (403). Choose the bank file again or check the Drive API configuration.`);
  if (status === 404) return Error(`${action}: the file was not found or was not granted to this app (404). Choose it again.`);
  if (status === 429 || status >= 500) return Error(`${action}: Google is temporarily unavailable (${status}). The app will retry later.`);
  return Error(`${action} failed (${status}).`);
}
export const EMPTY_BANK = 'EMPTY_BANK';
/** Parse bank text; an empty file is a valid "no questions yet" state, not a crash. */
export function parseBankText(body: string): DriveBank | typeof EMPTY_BANK {
  if (body.length > MAX_BANK_TEXT_CHARS) throw Error('The bank file is too large.');
  if (!body.replace(/^\uFEFF/, '').trim()) return EMPTY_BANK;
  let json: unknown;
  try {
    json = JSON.parse(body.replace(/^\uFEFF/, ''));
  } catch {
    throw Error('The bank file is not valid JSON. The current session was not changed.');
  }
  const bank = validateBank(json);
  if (import.meta.env.DEV && bank.parseWarnings?.length) console.warn('[Math Scratchpad] Bank content warnings:', bank.parseWarnings);
  return bank;
}
export type DriveMeta = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  md5Checksum?: string;
  modifiedTime?: string;
  headRevisionId?: string;
  version?: string;
  trashed?: boolean;
};
const validFileId = (id: string) => /^[A-Za-z0-9_-]{10,150}$/.test(id);
/** Cheap metadata request used for change detection; content is downloaded only when this changes. */
export async function readDriveMeta(fileId: string, token: string): Promise<DriveMeta> {
  if (!validFileId(fileId)) throw Error('Invalid Google Drive file ID.');
  const fields = 'id,name,mimeType,size,md5Checksum,modifiedTime,headRevisionId,version,trashed';
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${fields}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw driveError(response.status, 'Reading file metadata');
  const meta = (await response.json()) as DriveMeta;
  if (meta.trashed) throw Error('The bank file is in the Google Drive trash.');
  if (meta.mimeType === 'application/vnd.google-apps.document') throw Error('The bank file is a Google Doc. Select a regular .json file.');
  return meta;
}
/** Fingerprint of Drive metadata; any content edit changes md5Checksum/headRevisionId/version. */
export function metaFingerprint(meta: DriveMeta): string {
  return [meta.id, meta.md5Checksum ?? '', meta.headRevisionId ?? '', meta.version ?? '', meta.size ?? '', meta.modifiedTime ?? ''].join(
    '|',
  );
}
export async function readPrivateBankText(fileId: string, token: string): Promise<string> {
  if (!validFileId(fileId)) throw Error('Invalid Google Drive file ID.');
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw driveError(response.status, 'Reading the question bank');
  return response.text();
}
export async function readPrivateBank(fileId: string, token: string): Promise<DriveBank | typeof EMPTY_BANK> {
  return parseBankText(await readPrivateBankText(fileId, token));
}
