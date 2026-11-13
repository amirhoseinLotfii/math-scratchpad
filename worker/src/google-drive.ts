import type { WorkerEnv } from './env';
import { SnapshotError, snapshotHash, snapshotName, writeImmutableSnapshot, type SnapshotStore } from './immutable-snapshot';

const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_BATCH_API = 'https://www.googleapis.com/batch/drive/v3';
const GOOGLE_TOKEN_API = 'https://oauth2.googleapis.com/token';
const GOOGLE_DRIVE_ABOUT_API = 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,me)';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const MAX_ETAG_RETRIES = 3;
const SIMPLE_UPLOAD_LIMIT_BYTES = 5 * 1024 * 1024;
const MULTIPART_UPLOAD_LIMIT_BYTES = SIMPLE_UPLOAD_LIMIT_BYTES - 16 * 1024;
const DRIVE_GET_RETRY_ATTEMPTS = 3;
const DRIVE_GET_RETRY_BASE_DELAY_MS = 150;

export type DriveMirrorErrorCode =
  | 'not_configured'
  | 'reauthorization_required'
  | 'account_mismatch'
  | 'permission_denied'
  | 'quota_exceeded'
  | 'etag_conflict'
  | 'invalid_response'
  | 'duplicate_file'
  | 'subrequest_budget_exceeded'
  | 'network_error';

export class DriveMirrorError extends Error {
  constructor(readonly code: DriveMirrorErrorCode) {
    super(code);
    this.name = 'DriveMirrorError';
  }
}

export type DriveFileRef = { id: string; etag: string };
export type DriveFileContent = DriveFileRef & { content: string };
export type DriveSnapshotRef = { id: string; name: string; sha256: string };
export type DriveFolderChild = { id: string; name: string; mimeType: string; parents: string[] };
type DriveFileMetadata = { id?: unknown; name?: unknown; mimeType?: unknown; parents?: unknown; trashed?: unknown };
type MergeContent = (remote: string, desired: string) => string;
type DriveRequestStage =
  | 'drive_folder_lookup'
  | 'drive_file_lookup'
  | 'drive_file_read'
  | 'drive_lookup'
  | 'drive_create'
  | 'drive_update'
  | 'drive_trash'
  | 'drive_upload';

/**
 * Minimal Drive v3 client for the owner-only mirror. It never calls the
 * permissions endpoint; newly-created files inherit the owner's private Drive
 * permissions. OAuth values are read only from Worker Secrets.
 */
export class GoogleDriveClient {
  private accessToken: string | undefined;
  private expiresAt = 0;
  private tokenPromise: Promise<string> | undefined;
  // Non-sensitive operational stage only. Never record URLs, tokens, response bodies, IDs or user data.
  private stage = 'idle';
  get diagnosticStage(): string { return this.stage; }


  constructor(
    private readonly env: WorkerEnv,
    // workerd requires the native fetch receiver to be globalThis.
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
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
    const matches = await this.listFiles(query, file => file.name === name && file.mimeType === FOLDER_MIME_TYPE, 'drive_folder_lookup');
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

  /** Find an existing direct child folder without creating or modifying anything. */
  async findFolderId(name: string, parentId: string): Promise<string | undefined> {
    const query = new URLSearchParams({
      q: `name = '${escapeQuery(name)}' and mimeType = '${FOLDER_MIME_TYPE}' and '${escapeQuery(parentId)}' in parents and trashed = false`,
      spaces: 'drive',
      pageSize: '1000',
      fields: 'nextPageToken,incompleteSearch,files(id,name,mimeType,parents,trashed)',
    });
    const matches = await this.listFiles(query, file => file.name === name && file.mimeType === FOLDER_MIME_TYPE
      && file.trashed !== true && Array.isArray(file.parents) && file.parents.includes(parentId), 'drive_folder_lookup');
    if (matches.length > 1) throw new DriveMirrorError('duplicate_file');
    const id = matches[0]?.id;
    if (typeof id !== 'string' || !id) return undefined;
    return id;
  }

  /** List direct children only. Callers must constrain the parent to an app-owned folder. */
  async listFilesInFolder(parentId: string): Promise<DriveFolderChild[]> {
    const query = new URLSearchParams({
      q: `'${escapeQuery(parentId)}' in parents and trashed = false`,
      spaces: 'drive',
      pageSize: '1000',
      fields: 'nextPageToken,incompleteSearch,files(id,name,mimeType,parents,trashed)',
    });
    const files = await this.listFiles(query, file => file.trashed !== true
      && Array.isArray(file.parents) && file.parents.includes(parentId), 'drive_file_lookup');
    return files.map(file => {
      if (typeof file.id !== 'string' || !file.id || typeof file.name !== 'string'
        || typeof file.mimeType !== 'string' || !Array.isArray(file.parents)
        || !file.parents.every(parent => typeof parent === 'string')) {
        throw new DriveMirrorError('invalid_response');
      }
      return { id: file.id, name: file.name, mimeType: file.mimeType, parents: file.parents as string[] };
    });
  }

  /** Move a verified direct child file to Drive trash; never deletes folders. */
  async trashFileInFolder(id: string, parentId: string): Promise<boolean> {
    const metadata = await this.readFileMetadata(id, 'id,mimeType,parents,trashed');
    const parents = metadata.parents;
    if (metadata.id !== id || metadata.trashed === true || metadata.mimeType === FOLDER_MIME_TYPE
      || !Array.isArray(parents) || !parents.includes(parentId)) {
      if (metadata.trashed === true) return false;
      throw new DriveMirrorError('invalid_response');
    }
    const boundary = `mathscratchpad_reset_${crypto.randomUUID().replace(/-/g, '')}`;
    const patchBody = JSON.stringify({ trashed: true });
    const path = `/drive/v3/files/${encodeURIComponent(id)}?fields=id%2Ctrashed%2Cparents`;
    const batchBody = [
      `--${boundary}\r\n`,
      'Content-Type: application/http\r\n',
      'Content-ID: <trash-learning-mirror>\r\n\r\n',
      `PATCH ${path} HTTP/1.1\r\n`,
      'Content-Type: application/json; charset=UTF-8\r\n',
      `Content-Length: ${utf8Length(patchBody)}\r\n\r\n`,
      `${patchBody}\r\n`,
      `--${boundary}--\r\n`,
    ].join('');
    const response = await this.apiFetch(DRIVE_BATCH_API, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/mixed; boundary=${boundary}` },
      body: batchBody,
    }, 'drive_trash');
    if (!response.ok) throw errorForStatus(response.status);
    const batchContent = new TextDecoder().decode(await response.arrayBuffer());
    const batchResult = parseSingleDriveBatchResponse(response.headers.get('Content-Type'), batchContent);
    this.stage = `drive_trash_batch_http_${batchResult.status}`;
    if (batchResult.status < 200 || batchResult.status >= 300) throw errorForStatus(batchResult.status);
    const trashed = parseJsonText<DriveFileMetadata>(batchResult.body);
    if (trashed.id !== id || trashed.trashed !== true || !Array.isArray(trashed.parents) || !trashed.parents.includes(parentId)) {
      throw new DriveMirrorError('invalid_response');
    }
    return true;
  }

  /** Store a content-addressed Drive file and verify its exact bytes after upload. */
  async writeImmutableTextFile(input: {
    logicalName: string;
    parentId: string;
    mimeType: string;
    content: string;
  }): Promise<DriveSnapshotRef> {
    const name = await snapshotName(input.logicalName, input.content);
    const store: SnapshotStore = {
      find: candidate => this.findFileIds(candidate, input.parentId, input.mimeType),
      create: candidate => this.createSnapshotFile(candidate, input.parentId, input.mimeType, input.content),
      read: id => this.readTextContent(id),
    };
    try {
      const saved = await writeImmutableSnapshot(store, input.logicalName, input.content);
      return { ...saved, sha256: await snapshotHash(input.content) };
    } catch (error) {
      if (error instanceof SnapshotError) {
        throw new DriveMirrorError(error.code === 'duplicate_snapshot' ? 'duplicate_file' : 'invalid_response');
      }
      throw error;
    }
  }

  /** Find the legacy mutable file without modifying it; used only during migration to snapshots. */
  async findTextFileId(name: string, parentId: string, mimeType: string): Promise<string | undefined> {
    return this.findFile(name, parentId, mimeType);
  }

  /** Read selected metadata fields of one file the app is authorized for (drive.file). */
  async readFileMetadata(id: string, fields: string): Promise<Record<string, unknown>> {
    const response = await this.apiFetch(`${DRIVE_FILES_API}/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}`, { method: 'GET' }, 'drive_file_lookup');
    if (!response.ok) throw errorForStatus(response.status);
    const data = await readJson<unknown>(response);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new DriveMirrorError('invalid_response');
    return data as Record<string, unknown>;
  }

  /** Read media bytes without relying on an ETag header, which Drive omits for media downloads. */
  async readTextContent(id: string): Promise<string> {
    const response = await this.apiFetch(`${DRIVE_FILES_API}/${encodeURIComponent(id)}?alt=media`, { method: 'GET' }, 'drive_file_read');
    if (!response.ok) throw errorForStatus(response.status);
    return response.text();
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
    const matches = await this.listFiles(query, file => file.name === name && file.mimeType === mimeType, 'drive_file_lookup');
    if (matches.length > 1) throw new DriveMirrorError('duplicate_file');
    const id = matches[0]?.id;
    if (typeof id !== 'string') return undefined;
    return id;
  }

  private async findFileIds(name: string, parentId: string, mimeType: string): Promise<string[]> {
    const query = new URLSearchParams({
      q: `name = '${escapeQuery(name)}' and mimeType = '${escapeQuery(mimeType)}' and '${escapeQuery(parentId)}' in parents and trashed = false`,
      spaces: 'drive',
      pageSize: '1000',
      fields: 'nextPageToken,incompleteSearch,files(id,name,mimeType,parents)',
    });
    const matches = await this.listFiles(query, file => file.name === name && file.mimeType === mimeType
      && Array.isArray(file.parents) && file.parents.includes(parentId), 'drive_file_lookup');
    const ids = matches.map(file => file.id);
    if (ids.some(id => typeof id !== 'string' || id.length === 0)) throw new DriveMirrorError('invalid_response');
    return ids as string[];
  }

  private async listFiles(
    query: URLSearchParams,
    matches: (file: DriveFileMetadata) => boolean,
    stage: DriveRequestStage,
  ): Promise<DriveFileMetadata[]> {
    const found: DriveFileMetadata[] = [];
    const seenTokens = new Set<string>();
    let pageToken: string | undefined;
    do {
      if (pageToken) query.set('pageToken', pageToken);
      const response = await this.apiFetch(`${DRIVE_FILES_API}?${query.toString()}`, { method: 'GET' }, stage);
      if (!response.ok) throw errorForStatus(response.status);
      const data = await readJson<{ files?: unknown; nextPageToken?: unknown; incompleteSearch?: unknown }>(response);
      if (!Array.isArray(data.files) || data.incompleteSearch === true) throw new DriveMirrorError('invalid_response');
      const page = data.files.filter((file): file is DriveFileMetadata => Boolean(file && typeof file === 'object' && !Array.isArray(file)));
      found.push(...page.filter(matches));
      const next = data.nextPageToken;
      if (typeof next !== 'string' || !next) break;
      if (seenTokens.has(next)) throw new DriveMirrorError('invalid_response');
      seenTokens.add(next);
      pageToken = next;
    } while (true);
    return found;
  }

  private async createSnapshotFile(name: string, parentId: string, mimeType: string, content: string): Promise<string> {
    let response: Response;
    if (utf8Length(content) > MULTIPART_UPLOAD_LIMIT_BYTES) {
      response = await this.resumableUpload({
        url: `${DRIVE_UPLOAD_API}?uploadType=resumable&fields=id,name,mimeType,parents`,
        method: 'POST',
        mimeType,
        content,
        metadata: { name, mimeType, parents: [parentId] },
      });
    } else {
      const boundary = `mathscratchpad_${crypto.randomUUID().replace(/-/g, '')}`;
      const metadata = JSON.stringify({ name, mimeType, parents: [parentId] });
      const body = [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
        `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n`,
        `--${boundary}--`,
      ].join('');
      response = await this.apiFetch(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,mimeType,parents`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      });
    }
    if (!response.ok) throw errorForStatus(response.status);
    const file = await readJson<DriveFileMetadata>(response);
    if (typeof file.id !== 'string' || file.name !== name || file.mimeType !== mimeType
      || !Array.isArray(file.parents) || !file.parents.includes(parentId)) {
      throw new DriveMirrorError('invalid_response');
    }
    return file.id;
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
    const response = await this.apiFetch(`${DRIVE_FILES_API}/${encodeURIComponent(id)}?alt=media`, { method: 'GET' }, 'drive_file_read');
    if (!response.ok) throw errorForStatus(response.status);
    const etag = response.headers.get('ETag');
    if (!etag) throw new DriveMirrorError('invalid_response');
    return { id, etag, content: await response.text() };
  }

  private async apiFetch(input: string, init: RequestInit, requestedStage?: DriveRequestStage): Promise<Response> {
    const send = async () => {
      const token = await this.getAccessToken();
      const target = new URL(input);
      const requestStage = requestedStage ?? (target.pathname.startsWith('/upload/') ? 'drive_upload'
        : target.pathname.endsWith('/files') && init.method === 'POST' ? 'drive_create'
        : init.method === 'PATCH' ? 'drive_update'
        : 'drive_lookup');
      this.stage = requestStage;
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      const isSafeRead = (init.method ?? 'GET').toUpperCase() === 'GET';
      const maxAttempts = isSafeRead ? DRIVE_GET_RETRY_ATTEMPTS : 1;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        let response: Response;
        try {
          response = await this.fetcher(input, { ...init, headers });
        }
        catch (error) {
          if ((error as { code?: unknown } | null)?.code === 'subrequest_budget_exceeded') {
            this.stage = 'subrequest_budget';
            throw error;
          }
          if (attempt < maxAttempts - 1) {
            await waitForDriveRetry(attempt);
            continue;
          }
          const failureStage = requestStage === 'drive_trash' || requestStage === 'drive_file_lookup'
            ? `${requestStage}_fetch_rejected_${safeFetchFailureSuffix(error)}`
            : `${requestStage}_fetch_rejected`;
          this.stage = failureStage;
          throw new DriveMirrorError('network_error');
        }

        if (isSafeRead && response.status >= 500 && attempt < maxAttempts - 1) {
          try { await response.body?.cancel(); } catch { /* Best effort before retrying the read. */ }
          await waitForDriveRetry(attempt);
          continue;
        }
        this.stage = `${requestStage}_http_${response.status}`;
        return response;
      }
      throw new DriveMirrorError('network_error');
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
    this.stage = 'oauth_refresh';
    try {
      response = await this.fetcher(GOOGLE_TOKEN_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    } catch {
      this.stage = 'oauth_refresh_fetch_rejected';
      throw new DriveMirrorError('network_error');
    }
    if (!response.ok) {
      // Google's OAuth error *code* is a fixed public protocol value. Never
      // persist the response body, error_description, token or client secret.
      let reason = 'unknown';
      try {
        const payload: unknown = await response.json();
        const candidate = payload && typeof payload === 'object' ? (payload as { error?: unknown }).error : undefined;
        if (typeof candidate === 'string' && [
          'invalid_client', 'invalid_grant', 'unauthorized_client',
          'invalid_request', 'access_denied', 'temporarily_unavailable',
        ].includes(candidate)) reason = candidate;
      } catch { /* Ignore and retain the HTTP status. */ }
      this.stage = `oauth_refresh_http_${response.status}_${reason}`;
      throw new DriveMirrorError(response.status === 400 || response.status === 401 ? 'reauthorization_required' : errorForStatus(response.status).code);
    }
    const token = await readJson<{ access_token?: unknown; expires_in?: unknown }>(response);
    if (typeof token.access_token !== 'string' || !token.access_token || typeof token.expires_in !== 'number') {
      throw new DriveMirrorError('invalid_response');
    }

    let identityResponse: Response;
    this.stage = 'drive_owner_verification';
    try {
      // Drive about.get works with drive.file; userinfo would incorrectly require
      // an additional Google profile scope and block a valid Drive-only token.
      identityResponse = await this.fetcher(GOOGLE_DRIVE_ABOUT_API, { headers: { Authorization: `Bearer ${token.access_token}` } });
    } catch {
      this.stage = 'drive_owner_verification_fetch_rejected';
      throw new DriveMirrorError('network_error');
    }
    if (!identityResponse.ok) {
      this.stage = `drive_owner_verification_http_${identityResponse.status}`;
      throw new DriveMirrorError(identityResponse.status === 401 ? 'reauthorization_required' : errorForStatus(identityResponse.status).code);
    }
    const identity = await readJson<{ user?: { emailAddress?: unknown; me?: unknown } }>(identityResponse);
    if (typeof identity.user?.emailAddress !== 'string'
      || identity.user.emailAddress.trim().toLowerCase() !== this.env.OWNER_EMAIL.trim().toLowerCase()
      || identity.user.me !== true) {
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

function parseSingleDriveBatchResponse(contentType: string | null, content: string): { status: number; body: string } {
  const boundary = contentType?.match(/(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))/i);
  const boundaryValue = boundary?.[1] ?? boundary?.[2];
  if (!boundaryValue) throw new DriveMirrorError('invalid_response');

  const parts = content.split(`--${boundaryValue}`).map(part => part.trim()).filter(part => part && part !== '--');
  if (parts.length !== 1) throw new DriveMirrorError('invalid_response');

  const part = parts[0];
  const mimeHeaderBreak = /\r?\n\r?\n/.exec(part);
  if (!mimeHeaderBreak || !/^Content-Type:\s*application\/http\s*$/im.test(part.slice(0, mimeHeaderBreak.index))) {
    throw new DriveMirrorError('invalid_response');
  }

  const nested = part.slice(mimeHeaderBreak.index + mimeHeaderBreak[0].length);
  const statusLineBreak = /\r?\n/.exec(nested);
  if (!statusLineBreak) throw new DriveMirrorError('invalid_response');
  const statusLine = nested.slice(0, statusLineBreak.index);
  const statusMatch = /^HTTP\/\d(?:\.\d)?\s+(\d{3})(?:\s|$)/i.exec(statusLine);
  if (!statusMatch) throw new DriveMirrorError('invalid_response');

  const nestedHeaders = nested.slice(statusLineBreak.index + statusLineBreak[0].length);
  const responseHeaderBreak = /\r?\n\r?\n/.exec(nestedHeaders);
  if (!responseHeaderBreak) throw new DriveMirrorError('invalid_response');

  return {
    status: Number(statusMatch[1]),
    body: nestedHeaders.slice(responseHeaderBreak.index + responseHeaderBreak[0].length).trim(),
  };
}

function parseJsonText<T>(content: string): T {
  try { return JSON.parse(content) as T; }
  catch { throw new DriveMirrorError('invalid_response'); }
}

function safeFetchFailureSuffix(error: unknown): string {
  const knownCodes: Record<string, string> = {
    ECONNRESET: 'connection_reset',
    ECONNREFUSED: 'connection_refused',
    ETIMEDOUT: 'timeout',
    ENOTFOUND: 'host_not_found',
    EHOSTUNREACH: 'host_unreachable',
    EAI_AGAIN: 'dns_retry',
    EPIPE: 'connection_broken',
    ECONNABORTED: 'connection_aborted',
    UND_ERR_CONNECT_TIMEOUT: 'connect_timeout',
    UND_ERR_HEADERS_TIMEOUT: 'headers_timeout',
    UND_ERR_BODY_TIMEOUT: 'body_timeout',
    UND_ERR_SOCKET: 'socket_error',
    ERR_SOCKET_CONNECTION_TIMEOUT: 'connect_timeout',
    ERR_INVALID_URL: 'invalid_url',
    ERR_INVALID_STATE: 'invalid_state',
  };

  const knownNames: Record<string, string> = {
    AbortError: 'aborted',
    ConnectTimeoutError: 'connect_timeout',
    Error: 'generic_error',
    FetchError: 'fetch_error',
    HeadersTimeoutError: 'headers_timeout',
    NetworkError: 'network_error',
    SocketError: 'socket_error',
    TimeoutError: 'timeout',
    TypeError: 'type_error',
  };

  const safeMessagePrefixes: Array<{ pattern: RegExp; suffix: string }> = [
    { pattern: /^too many subrequests\b/i, suffix: 'subrequest_limit' },
    { pattern: /^fetch failed\b/i, suffix: 'fetch_failed' },
    { pattern: /^failed to fetch\b/i, suffix: 'fetch_failed' },
    { pattern: /^network request failed\b/i, suffix: 'network_error' },
    { pattern: /^network error\b/i, suffix: 'network_error' },
    { pattern: /^connection reset\b/i, suffix: 'connection_reset' },
    { pattern: /^connection refused\b/i, suffix: 'connection_refused' },
    { pattern: /^connection timed out\b/i, suffix: 'timeout' },
    { pattern: /^connect timeout\b/i, suffix: 'connect_timeout' },
    { pattern: /^headers timeout\b/i, suffix: 'headers_timeout' },
    { pattern: /^socket hang up\b/i, suffix: 'socket_error' },
    { pattern: /^host not found\b/i, suffix: 'host_not_found' },
    { pattern: /^name resolution\b/i, suffix: 'dns_error' },
    { pattern: /^tls handshake failed\b/i, suffix: 'tls_error' },
  ];

  const chain: object[] = [];
  const seen = new Set<object>();
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && (typeof current === 'object' || typeof current === 'function'); depth++) {
    const item = current as object;
    if (seen.has(item)) break;
    seen.add(item);
    chain.push(item);
    current = readSafeValue(item, 'cause');
  }

  // Prefer a transport code from any nested cause to a broad wrapper error name.
  for (const item of chain) {
    const code = readSafeValue(item, 'code');
    if (typeof code === 'string' && Object.prototype.hasOwnProperty.call(knownCodes, code)) return knownCodes[code];
  }
  for (const item of chain) {
    const name = readSafeValue(item, 'name');
    if (typeof name === 'string' && name !== 'Error'
      && Object.prototype.hasOwnProperty.call(knownNames, name)) return knownNames[name];
  }
  for (const item of chain) {
    const message = readSafeValue(item, 'message');
    if (typeof message !== 'string') continue;
    for (const candidate of safeMessagePrefixes) {
      if (candidate.pattern.test(message.trim())) return candidate.suffix;
    }
    const messageSuffix = safeFetchMessageSuffix(message);
    if (messageSuffix) return messageSuffix;
  }
  if (chain.some(item => readSafeValue(item, 'name') === 'Error')) return knownNames.Error;
  return 'unknown';
}

function safeFetchMessageSuffix(message: string): string | undefined {
  const normalized = message.toLowerCase();
  if (/\b(?:dns|eai_again|name resolution|resolve host)\b/.test(normalized)) return 'dns_error';
  if (/\b(?:timeout|timed out|etimedout)\b/.test(normalized)) return 'timeout';
  if (/\b(?:connection reset|econnreset)\b/.test(normalized)) return 'connection_reset';
  if (/\b(?:connection refused|econnrefused)\b/.test(normalized)) return 'connection_refused';
  if (/\bsocket\b/.test(normalized)) return 'socket_error';
  if (/\b(?:connect|connection)\b/.test(normalized) && /\b(?:fail|failed|failure|error|unavailable)\b/.test(normalized)) {
    return 'connection_error';
  }
  if (/\bnetwork\b/.test(normalized)) return 'network_error';
  if (/\bfetch\b/.test(normalized) && /\b(?:fail|failure|reject|rejected)\b/.test(normalized)) return 'fetch_failed';
  return undefined;
}

function readSafeValue(target: object, key: string): unknown {
  try {
    return (target as Record<string, unknown>)[key];
  }
  catch {
    return undefined;
  }
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

function waitForDriveRetry(attempt: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, DRIVE_GET_RETRY_BASE_DELAY_MS * 2 ** attempt));
}

async function readJson<T>(response: Response): Promise<T> {
  try { return await response.json() as T; }
  catch { throw new DriveMirrorError('invalid_response'); }
}

function utf8Length(content: string): number {
  return new TextEncoder().encode(content).byteLength;
}
