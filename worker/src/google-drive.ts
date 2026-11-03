import type { WorkerEnv } from './env';

const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const GOOGLE_TOKEN_API = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_API = 'https://www.googleapis.com/oauth2/v3/userinfo';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const MAX_ETAG_RETRIES = 3;
const SIMPLE_UPLOAD_LIMIT_BYTES = 5 * 1024 * 1024;
const MULTIPART_UPLOAD_LIMIT_BYTES = SIMPLE_UPLOAD_LIMIT_BYTES - 16 * 1024;

export type DriveMirrorErrorCode =
  | 'not_configured'
  | 'reauthorization_required'
  | 'account_mismatch'
  | 'permission_denied'
  | 'quota_exceeded'
  | 'etag_conflict'
  | 'invalid_response'
  | 'duplicate_file'
  | 'network_error';

export class DriveMirrorError extends Error {
  constructor(readonly code: DriveMirrorErrorCode) {
    super(code);
    this.name = 'DriveMirrorError';
  }
}

export type DriveFileRef = { id: string; etag: string };
export type DriveFileContent = DriveFileRef & { content: string };
type DriveFileMetadata = { id?: unknown; name?: unknown; mimeType?: unknown; parents?: unknown };
type MergeContent = (remote: string, desired: string) => string;

/**
 * Minimal Drive v3 client for the owner-only mirror. It never calls the
 * permissions endpoint; newly-created files inherit the owner's private Drive
 * permissions. OAuth values are read only from Worker Secrets.
 */
export class GoogleDriveClient {
  private accessToken: string | undefined;
  private expiresAt = 0;
  private tokenPromise: Promise<string> | undefined;

  constructor(
    private readonly env: WorkerEnv,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  get isConfigured(): boolean {
    return Boolean(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_DRIVE_CLIENT_SECRET && this.env.GOOGLE_DRIVE_REFRESH_TOKEN);
  }

  async ensureFolder(name: string, parentId: string): Promise<string> {
    const query = new URLSearchParams({
      q: `name = '${escapeQuery(name)}' and mimeType = '${FOLDER_MIME_TYPE}' and '${escapeQuery(parentId)}' in parents and trashed = false`,
      spaces: 'drive',
      pageSize: '1000',
      fields: 'nextPageToken,files(id,name,mimeType,parents)',
    });
    const matches = await this.listFiles(query, file => file.name === name && file.mimeType === FOLDER_MIME_TYPE);
    if (matches.length > 1) throw new DriveMirrorError('duplicate_file');
    if (matches.length === 1 && typeof matches[0].id === 'string') return matches[0].id;

    const created = await this.apiFetch(`${DRIVE_FILES_API}?fields=id,name,mimeType,parents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME_TYPE, parents: [parentId] }),
    });
    if (!created.ok) throw errorForStatus(created.status);
    const folder = await readJson<DriveFileMetadata>(created);
    if (typeof folder.id !== 'string' || folder.name !== name || folder.mimeType !== FOLDER_MIME_TYPE
      || !Array.isArray(folder.parents) || !folder.parents.includes(parentId)) {
      throw new DriveMirrorError('invalid_response');
    }
    return folder.id;
  }

  async ensureRootFolder(name: string): Promise<string> {
    return this.ensureFolder(name, 'root');
  }

  async upsertTextFile(input: {
    name: string;
    parentId: string;
    mimeType: string;
    desiredContent: string;
    knownFile?: DriveFileRef;
    mergeContent: MergeContent;
  }): Promise<DriveFileContent> {
    let file = input.knownFile;
    let remoteContent: string | undefined;

    if (!file) {
      const foundId = await this.findFile(input.name, input.parentId, input.mimeType);
      if (foundId) {
        const remote = await this.readTextFile(foundId);
        file = { id: remote.id, etag: remote.etag };
        remoteContent = remote.content;
      }
    }

    if (!file) return this.createTextFile(input.name, input.parentId, input.mimeType, input.desiredContent);
    let content = remoteContent === undefined
      ? input.desiredContent
      : input.mergeContent(remoteContent, input.desiredContent);

    for (let attempt = 0; attempt < MAX_ETAG_RETRIES; attempt += 1) {
      const response = await this.updateTextFile(file, input.mimeType, content);
      if (response.status === 412) {
        const latest = await this.readTextFile(file.id);
        file = { id: latest.id, etag: latest.etag };
        content = input.mergeContent(latest.content, content);
        continue;
      }
      if (!response.ok) throw errorForStatus(response.status);
      const etag = response.headers.get('ETag');
      if (etag) return { id: file.id, etag, content };

      // A successful write without a response ETag must not be treated as a
      // safe checkpoint. Read it back before allowing another conditional write.
      const verified = await this.readTextFile(file.id);
      if (verified.content !== content) throw new DriveMirrorError('invalid_response');
      return verified;
    }
    throw new DriveMirrorError('etag_conflict');
  }

  private async findFile(name: string, parentId: string, mimeType: string): Promise<string | undefined> {
    const query = new URLSearchParams({
      q: `name = '${escapeQuery(name)}' and mimeType = '${escapeQuery(mimeType)}' and '${escapeQuery(parentId)}' in parents and trashed = false`,
      spaces: 'drive',
      pageSize: '1000',
      fields: 'nextPageToken,files(id,name,mimeType,parents)',
    });
    const matches = await this.listFiles(query, file => file.name === name && file.mimeType === mimeType);
    if (matches.length > 1) throw new DriveMirrorError('duplicate_file');
    const id = matches[0]?.id;
    if (typeof id !== 'string') return undefined;
    return id;
  }

  private async listFiles(query: URLSearchParams, matches: (file: DriveFileMetadata) => boolean): Promise<DriveFileMetadata[]> {
    const found: DriveFileMetadata[] = [];
    const seenTokens = new Set<string>();
    let pageToken: string | undefined;
    do {
      if (pageToken) query.set('pageToken', pageToken);
      const response = await this.apiFetch(`${DRIVE_FILES_API}?${query.toString()}`, { method: 'GET' });
      if (!response.ok) throw errorForStatus(response.status);
      const data = await readJson<{ files?: DriveFileMetadata[]; nextPageToken?: unknown }>(response);
      found.push(...(data.files?.filter(matches) ?? []));
      const next = data.nextPageToken;
      if (typeof next !== 'string' || !next || seenTokens.has(next)) break;
      seenTokens.add(next);
      pageToken = next;
    } while (true);
    return found;
  }

  private async createTextFile(name: string, parentId: string, mimeType: string, content: string): Promise<DriveFileContent> {
    if (utf8Length(content) > MULTIPART_UPLOAD_LIMIT_BYTES) {
      const response = await this.resumableUpload({
        url: `${DRIVE_UPLOAD_API}?uploadType=resumable&fields=id,name,mimeType,parents`,
        method: 'POST',
        mimeType,
        content,
        metadata: { name, mimeType, parents: [parentId] },
      });
      if (!response.ok) throw errorForStatus(response.status);
      const file = await readJson<DriveFileMetadata>(response);
      if (typeof file.id !== 'string' || file.name !== name || file.mimeType !== mimeType
        || !Array.isArray(file.parents) || !file.parents.includes(parentId)) {
        throw new DriveMirrorError('invalid_response');
      }
      const etag = response.headers.get('ETag');
      if (etag) return { id: file.id, etag, content };
      const verified = await this.readTextFile(file.id);
      if (verified.content !== content) throw new DriveMirrorError('invalid_response');
      return verified;
    }

    const boundary = `mathscratchpad_${crypto.randomUUID().replace(/-/g, '')}`;
    const metadata = JSON.stringify({ name, mimeType, parents: [parentId] });
    const body = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n`,
      `--${boundary}--`,
    ].join('');
    const response = await this.apiFetch(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,mimeType,parents`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!response.ok) throw errorForStatus(response.status);
    const file = await readJson<DriveFileMetadata>(response);
    if (typeof file.id !== 'string' || file.name !== name || file.mimeType !== mimeType
      || !Array.isArray(file.parents) || !file.parents.includes(parentId)) {
      throw new DriveMirrorError('invalid_response');
    }
    const etag = response.headers.get('ETag');
    if (etag) return { id: file.id, etag, content };
    const verified = await this.readTextFile(file.id);
    if (verified.content !== content) throw new DriveMirrorError('invalid_response');
    return verified;
  }

  private async updateTextFile(file: DriveFileRef, mimeType: string, content: string): Promise<Response> {
    if (utf8Length(content) <= SIMPLE_UPLOAD_LIMIT_BYTES) {
      return this.apiFetch(`${DRIVE_UPLOAD_API}/${encodeURIComponent(file.id)}?uploadType=media&fields=id,name,modifiedTime`, {
        method: 'PATCH',
        headers: { 'Content-Type': mimeType, 'If-Match': file.etag },
        body: content,
      });
    }
    return this.resumableUpload({
      url: `${DRIVE_UPLOAD_API}/${encodeURIComponent(file.id)}?uploadType=resumable&fields=id,name,modifiedTime`,
      method: 'PATCH',
      mimeType,
      content,
      ifMatch: file.etag,
    });
  }

  private async resumableUpload(input: {
    url: string;
    method: 'POST' | 'PATCH';
    mimeType: string;
    content: string;
    metadata?: Record<string, unknown>;
    ifMatch?: string;
  }): Promise<Response> {
    const headers = new Headers({
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': input.mimeType,
      'X-Upload-Content-Length': String(utf8Length(input.content)),
    });
    if (input.ifMatch) headers.set('If-Match', input.ifMatch);
    const initiated = await this.apiFetch(input.url, {
      method: input.method,
      headers,
      ...(input.metadata ? { body: JSON.stringify(input.metadata) } : {}),
    });
    if (!initiated.ok) return initiated;
    const location = initiated.headers.get('Location');
    if (!location) throw new DriveMirrorError('invalid_response');
    let uploadUrl: URL;
    try { uploadUrl = new URL(location); }
    catch { throw new DriveMirrorError('invalid_response'); }
    if (uploadUrl.origin !== 'https://www.googleapis.com' || uploadUrl.pathname !== '/upload/drive/v3/files') {
      throw new DriveMirrorError('invalid_response');
    }
    return this.apiFetch(uploadUrl.toString(), {
      method: 'PUT',
      headers: { 'Content-Type': input.mimeType },
      body: input.content,
    });
  }

  private async readTextFile(id: string): Promise<DriveFileContent> {
    const response = await this.apiFetch(`${DRIVE_FILES_API}/${encodeURIComponent(id)}?alt=media`, { method: 'GET' });
    if (!response.ok) throw errorForStatus(response.status);
    const etag = response.headers.get('ETag');
    if (!etag) throw new DriveMirrorError('invalid_response');
    return { id, etag, content: await response.text() };
  }

  private async apiFetch(input: string, init: RequestInit): Promise<Response> {
    const send = async () => {
      const token = await this.getAccessToken();
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      try { return await this.fetcher(input, { ...init, headers }); }
      catch { throw new DriveMirrorError('network_error'); }
    };
    let response = await send();
    if (response.status !== 401) return response;
    this.accessToken = undefined;
    this.expiresAt = 0;
    return send();
  }

  private async getAccessToken(): Promise<string> {
    if (!this.isConfigured) throw new DriveMirrorError('not_configured');
    if (this.accessToken && this.now() < this.expiresAt - 60_000) return this.accessToken;
    if (!this.tokenPromise) {
      this.tokenPromise = this.refreshAccessToken().finally(() => { this.tokenPromise = undefined; });
    }
    return this.tokenPromise;
  }

  private async refreshAccessToken(): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.env.GOOGLE_CLIENT_ID,
      client_secret: this.env.GOOGLE_DRIVE_CLIENT_SECRET!,
      refresh_token: this.env.GOOGLE_DRIVE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    });
    let response: Response;
    try {
      response = await this.fetcher(GOOGLE_TOKEN_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    } catch { throw new DriveMirrorError('network_error'); }
    if (!response.ok) throw new DriveMirrorError(response.status === 400 || response.status === 401 ? 'reauthorization_required' : errorForStatus(response.status).code);
    const token = await readJson<{ access_token?: unknown; expires_in?: unknown }>(response);
    if (typeof token.access_token !== 'string' || !token.access_token || typeof token.expires_in !== 'number') {
      throw new DriveMirrorError('invalid_response');
    }

    let identityResponse: Response;
    try {
      identityResponse = await this.fetcher(GOOGLE_USERINFO_API, { headers: { Authorization: `Bearer ${token.access_token}` } });
    } catch { throw new DriveMirrorError('network_error'); }
    if (!identityResponse.ok) throw new DriveMirrorError(identityResponse.status === 401 ? 'reauthorization_required' : errorForStatus(identityResponse.status).code);
    const identity = await readJson<{ email?: unknown; email_verified?: unknown }>(identityResponse);
    if (typeof identity.email !== 'string' || identity.email.trim().toLowerCase() !== this.env.OWNER_EMAIL.trim().toLowerCase()
      || identity.email_verified !== true) {
      throw new DriveMirrorError('account_mismatch');
    }
    this.accessToken = token.access_token;
    this.expiresAt = this.now() + Math.max(60, token.expires_in) * 1_000;
    return this.accessToken;
  }
}

function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function errorForStatus(status: number): DriveMirrorError {
  if (status === 401) return new DriveMirrorError('reauthorization_required');
  if (status === 403) return new DriveMirrorError('permission_denied');
  if (status === 404) return new DriveMirrorError('permission_denied');
  if (status === 409 || status === 412) return new DriveMirrorError('etag_conflict');
  if (status === 429 || status === 507) return new DriveMirrorError('quota_exceeded');
  if (status >= 500) return new DriveMirrorError('network_error');
  return new DriveMirrorError('invalid_response');
}

async function readJson<T>(response: Response): Promise<T> {
  try { return await response.json() as T; }
  catch { throw new DriveMirrorError('invalid_response'); }
}

function utf8Length(content: string): number {
  return new TextEncoder().encode(content).byteLength;
}
