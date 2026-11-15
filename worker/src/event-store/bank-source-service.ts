import { MAX_BANK_BYTES } from '../../../shared/contracts/limits';
import { readBoundedBody } from '../body';
import { DriveMirrorError, type GoogleDriveClient } from '../google-drive';
import { json } from './response';
function bankErrorResponse(error: unknown): Response {
  if (error instanceof BankTooLargeError) return json({ error: 'bank_too_large' }, 413);
  if (error instanceof BankFileTypeError) return json({ error: error.message }, 422);
  const code = error instanceof DriveMirrorError ? error.code : 'internal_error';
  if (code === 'not_configured') return json({ error: 'drive_not_configured' }, 503);
  if (code === 'permission_denied') return json({ error: 'bank_not_accessible' }, 403);
  if (code === 'reauthorization_required' || code === 'account_mismatch')
    return json({ error: 'drive_reauthorization_required', code }, 502);
  if (code === 'quota_exceeded') return json({ error: 'drive_rate_limited' }, 429);
  return json({ error: 'drive_unavailable', code }, 502);
}

/** Register the picked bank file after confirming the server Drive credential can read it. */
export async function registerBankSource(
  storage: DurableObjectStorage,
  getClient: () => GoogleDriveClient,
  request: Request,
): Promise<Response> {
  const body = await readBoundedBody(request, 4_096);
  if (!body) return json({ error: 'payload_too_large' }, 413);
  let input: { fileId?: unknown; fileName?: unknown };
  try {
    input = JSON.parse(new TextDecoder().decode(body)) ?? {};
  } catch {
    return json({ error: 'invalid_bank_source' }, 400);
  }
  if (
    typeof input.fileId !== 'string' ||
    !isValidDriveFileId(input.fileId) ||
    (input.fileName !== undefined && (typeof input.fileName !== 'string' || input.fileName.length > 255))
  ) {
    return json({ error: 'invalid_bank_source' }, 400);
  }
  const client = getClient();
  if (!client.isConfigured) return json({ error: 'drive_not_configured' }, 503);
  let meta: BankFileMeta;
  try {
    meta = await readBankMetadata(client, input.fileId);
  } catch (error) {
    return bankErrorResponse(error);
  }
  const fileName = typeof input.fileName === 'string' && input.fileName ? input.fileName : meta.name;
  storage.sql.exec(
    'INSERT INTO bank_source (singleton, file_id, file_name, registered_at) VALUES (1, ?, ?, ?) ' +
      'ON CONFLICT(singleton) DO UPDATE SET file_id=excluded.file_id, file_name=excluded.file_name, ' +
      'registered_at=excluded.registered_at',
    input.fileId,
    fileName,
    new Date().toISOString(),
  );
  return json({ fileId: input.fileId, fileName, meta });
}

/** Read only the registered bank file, with the Worker's own Drive credential. */
export async function readBank(
  storage: DurableObjectStorage,
  getClient: () => GoogleDriveClient,
  includeContent: boolean,
): Promise<Response> {
  const source = storage.sql
    .exec<{ file_id: string; file_name: string }>('SELECT file_id, file_name FROM bank_source WHERE singleton = 1')
    .toArray()[0];
  if (!source) return json({ error: 'bank_source_not_registered' }, 404);
  const client = getClient();
  if (!client.isConfigured) return json({ error: 'drive_not_configured' }, 503);
  try {
    const meta = await readBankMetadata(client, source.file_id);
    if (!includeContent) return json({ fileId: source.file_id, fileName: source.file_name, meta });
    const text = await client.readTextContent(source.file_id);
    if (new TextEncoder().encode(text).byteLength > MAX_BANK_BYTES) return json({ error: 'bank_too_large' }, 413);
    return json({ fileId: source.file_id, fileName: source.file_name, meta, text });
  } catch (error) {
    return bankErrorResponse(error);
  }
}

class BankTooLargeError extends Error {}
class BankFileTypeError extends Error {}

/** Same limit as the browser's bank parser. */
const BANK_META_FIELDS = 'id,name,mimeType,size,md5Checksum,modifiedTime,headRevisionId,version,trashed';
type BankFileMeta = {
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

function isValidDriveFileId(id: string): boolean {
  return /^[A-Za-z0-9_-]{10,150}$/.test(id);
}

async function readBankMetadata(client: GoogleDriveClient, fileId: string): Promise<BankFileMeta> {
  const raw = await client.readFileMetadata(fileId, BANK_META_FIELDS);
  if (raw.id !== fileId || typeof raw.name !== 'string' || typeof raw.mimeType !== 'string') throw new DriveMirrorError('invalid_response');
  const meta: BankFileMeta = { id: fileId, name: raw.name, mimeType: raw.mimeType };
  for (const key of ['size', 'md5Checksum', 'modifiedTime', 'headRevisionId', 'version'] as const) {
    if (typeof raw[key] === 'string') meta[key] = raw[key] as string;
  }
  if (typeof raw.trashed === 'boolean') meta.trashed = raw.trashed;
  if (meta.trashed) throw new BankFileTypeError('bank_trashed');
  if (meta.mimeType.startsWith('application/vnd.google-apps.')) throw new BankFileTypeError('bank_not_json_file');
  if (meta.size !== undefined && Number(meta.size) > MAX_BANK_BYTES) throw new BankTooLargeError();
  return meta;
}
