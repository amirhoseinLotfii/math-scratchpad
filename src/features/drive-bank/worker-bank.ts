/**
 * Read the picked question bank through the sync Worker.
 *
 * The Worker uses its own server-side Drive credential (same OAuth app, drive.file),
 * so polling keeps working after the browser's one-hour Drive token expires. The
 * browser still picks the file once with Google Picker; the Worker reads only the
 * file registered here. Any Worker unavailability returns undefined so the caller
 * can fall back to the client Drive token.
 */
import { SYNC_API_ORIGIN } from '../../sync/sync-config';
import { ensureApiToken, handleApiUnauthorized } from '../../sync/worker-session';
import type { DriveMeta } from './drive-bank';

type WorkerBankResponse = { fileId: string; meta: DriveMeta; text?: string };

function parseBankResponse(value: unknown, fileId: string, withText: boolean): WorkerBankResponse | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as { fileId?: unknown; meta?: unknown; text?: unknown };
  const meta = record.meta as DriveMeta | undefined;
  if (record.fileId !== fileId || !meta || typeof meta !== 'object' || meta.id !== fileId
    || typeof meta.name !== 'string' || typeof meta.mimeType !== 'string') return undefined;
  if (withText && typeof record.text !== 'string') return undefined;
  return { fileId, meta, ...(withText ? { text: record.text as string } : {}) };
}

async function errorCode(response: Response): Promise<string> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string' ? (value as { error: string }).error : '';
  } catch { return ''; }
}

/** A problem with the bank file itself; the client Drive path would fail the same way. */
class BankFileError extends Error {}

function hardFileError(code: string): BankFileError | undefined {
  if (code === 'bank_trashed') return new BankFileError('The bank file is in the Google Drive trash.');
  if (code === 'bank_not_json_file') return new BankFileError('The bank file is a Google Doc. Select a regular .json file.');
  if (code === 'bank_too_large') return new BankFileError('The bank file is too large.');
  return undefined;
}

async function registerBankSource(token: string, fileId: string, fileName: string): Promise<boolean> {
  const response = await fetch(`${SYNC_API_ORIGIN}/bank/source`, {
    method: 'POST', cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, ...(fileName ? { fileName } : {}) }),
  });
  if (response.status === 401) handleApiUnauthorized(token);
  return response.ok;
}

/**
 * Metadata only (withText false) or metadata plus content. Returns undefined when the
 * Worker path is unavailable (no session, Drive not configured on the Worker, file
 * not readable with the server credential, network); throws only for file problems
 * that the client Drive path would hit as well.
 */
export async function readBankViaWorker(fileId: string, fileName: string, withText: boolean): Promise<WorkerBankResponse | undefined> {
  let token: string | undefined;
  try { token = await ensureApiToken(); } catch { return undefined; }
  if (!token) return undefined;
  const path = withText ? '/bank/content' : '/bank/meta';
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`${SYNC_API_ORIGIN}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (response.status === 401) { handleApiUnauthorized(token); return undefined; }
      if (response.ok) {
        const parsed = parseBankResponse(await response.json(), fileId, withText);
        if (parsed) return parsed;
        // Another file is registered (e.g. picked on another device): register this one once.
        if (attempt === 0 && await registerBankSource(token, fileId, fileName)) continue;
        return undefined;
      }
      const code = await errorCode(response);
      const hard = hardFileError(code);
      if (hard) throw hard;
      if (attempt === 0 && code === 'bank_source_not_registered' && await registerBankSource(token, fileId, fileName)) continue;
      return undefined;
    }
  } catch (problem) {
    if (problem instanceof BankFileError) throw problem;
    return undefined;
  }
  return undefined;
}
