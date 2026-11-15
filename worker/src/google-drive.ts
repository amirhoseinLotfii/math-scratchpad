import { refreshDriveAccessToken } from './google-drive/auth';
import {
  DRIVE_FILES_API,
  GOOGLE_TOKEN_API,
  GOOGLE_DRIVE_ABOUT_API,
  MAX_ETAG_RETRIES,
  DRIVE_GET_RETRY_ATTEMPTS,
} from './google-drive/config';
import {
  DriveMirrorError,
  type DriveFileRef,
  type DriveFileContent,
  type DriveSnapshotRef,
  type DriveMirrorKind,
  type MergeContent,
  type DriveRequestStage,
} from './google-drive/types';
import { mirrorKindForName } from './google-drive/ownership';
import { readJson, errorForStatus, waitForDriveRetry } from './google-drive/http';
import { safeFetchFailureSuffix } from './google-drive/diagnostics';
import { DriveFolders } from './google-drive/folders';
import { createSnapshotFile, createTextFile, readTextFile, updateTextFile } from './google-drive/uploads';
export * from './google-drive/types';
export { hasLearningMirrorOwnership, MATH_SCRATCHPAD_DRIVE_OWNER } from './google-drive/ownership';

import type { WorkerEnv } from './env';
import { SnapshotError, snapshotHash, writeImmutableSnapshot, type SnapshotStore } from './immutable-snapshot';

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
  get diagnosticStage(): string {
    return this.stage;
  }

  constructor(
    private readonly env: WorkerEnv,
    // workerd requires the native fetch receiver to be globalThis.
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly now: () => number = Date.now,
  ) {}

  get isConfigured(): boolean {
    return Boolean(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_DRIVE_CLIENT_SECRET && this.env.GOOGLE_DRIVE_REFRESH_TOKEN);
  }

  private readonly folders = new DriveFolders(
    (input, init, stage) => this.apiFetch(input, init, stage),
    (id, fields) => this.readFileMetadata(id, fields),
    (stage) => {
      this.stage = stage;
    },
  );

  ensureFolder(name: string, parentId: string) {
    return this.folders.ensureFolder(name, parentId);
  }
  ensureRootFolder(name: string) {
    return this.folders.ensureRootFolder(name);
  }
  findFolderId(name: string, parentId: string) {
    return this.folders.findFolderId(name, parentId);
  }
  listFilesInFolder(parentId: string) {
    return this.folders.listFilesInFolder(parentId);
  }
  trashFileInFolder(id: string, parentId: string, kind: DriveMirrorKind) {
    return this.folders.trashFileInFolder(id, parentId, kind);
  }

  /** Store a content-addressed Drive file and verify its exact bytes after upload. */
  async writeImmutableTextFile(input: {
    logicalName: string;
    parentId: string;
    mimeType: string;
    content: string;
  }): Promise<DriveSnapshotRef> {
    const kind = mirrorKindForName(input.logicalName);
    const store: SnapshotStore = {
      find: (candidate) => this.folders.findFileIds(candidate, input.parentId, input.mimeType),
      create: (candidate) => createSnapshotFile(this.apiFetch.bind(this), candidate, input.parentId, input.mimeType, input.content, kind),
      read: (id) => this.readTextContent(id),
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
    return this.folders.findFile(name, parentId, mimeType);
  }

  /** Read selected metadata fields of one file the app is authorized for (drive.file). */
  async readFileMetadata(id: string, fields: string): Promise<Record<string, unknown>> {
    const response = await this.apiFetch(
      `${DRIVE_FILES_API}/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}`,
      { method: 'GET' },
      'drive_file_lookup',
    );
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
      const foundId = await this.folders.findFile(input.name, input.parentId, input.mimeType);
      if (foundId) {
        const remote = await readTextFile(this.apiFetch.bind(this), foundId);
        file = { id: remote.id, etag: remote.etag };
        remoteContent = remote.content;
      }
    }

    if (!file) return createTextFile(this.apiFetch.bind(this), input.name, input.parentId, input.mimeType, input.desiredContent);
    let content = remoteContent === undefined ? input.desiredContent : input.mergeContent(remoteContent, input.desiredContent);

    for (let attempt = 0; attempt < MAX_ETAG_RETRIES; attempt += 1) {
      const response = await updateTextFile(this.apiFetch.bind(this), file, input.mimeType, content);
      if (response.status === 412) {
        const latest = await readTextFile(this.apiFetch.bind(this), file.id);
        file = { id: latest.id, etag: latest.etag };
        content = input.mergeContent(latest.content, content);
        continue;
      }
      if (!response.ok) throw errorForStatus(response.status);
      const etag = response.headers.get('ETag');
      if (etag) return { id: file.id, etag, content };

      // A successful write without a response ETag must not be treated as a
      // safe checkpoint. Read it back before allowing another conditional write.
      const verified = await readTextFile(this.apiFetch.bind(this), file.id);
      if (verified.content !== content) throw new DriveMirrorError('invalid_response');
      return verified;
    }
    throw new DriveMirrorError('etag_conflict');
  }

  private async apiFetch(input: string, init: RequestInit, requestedStage?: DriveRequestStage): Promise<Response> {
    const send = async () => {
      const token = await this.getAccessToken();
      const target = new URL(input);
      const requestStage =
        requestedStage ??
        (target.pathname.startsWith('/upload/')
          ? 'drive_upload'
          : target.pathname.endsWith('/files') && init.method === 'POST'
            ? 'drive_create'
            : init.method === 'PATCH'
              ? 'drive_update'
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
        } catch (error) {
          if ((error as { code?: unknown } | null)?.code === 'subrequest_budget_exceeded') {
            this.stage = 'subrequest_budget';
            throw error;
          }
          if (attempt < maxAttempts - 1) {
            await waitForDriveRetry(attempt);
            continue;
          }
          const failureStage =
            requestStage === 'drive_trash' || requestStage === 'drive_file_lookup'
              ? `${requestStage}_fetch_rejected_${safeFetchFailureSuffix(error)}`
              : `${requestStage}_fetch_rejected`;
          this.stage = failureStage;
          throw new DriveMirrorError('network_error');
        }

        if (isSafeRead && response.status >= 500 && attempt < maxAttempts - 1) {
          try {
            await response.body?.cancel();
          } catch {
            /* Best effort before retrying the read. */
          }
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
      this.tokenPromise = this.refreshAccessToken().finally(() => {
        this.tokenPromise = undefined;
      });
    }
    return this.tokenPromise;
  }

  private async refreshAccessToken(): Promise<string> {
    const { accessToken, expiresIn } = await refreshDriveAccessToken(this.env, this.fetcher, (stage) => {
      this.stage = stage;
    });
    this.accessToken = accessToken;
    this.expiresAt = this.now() + Math.max(60, expiresIn) * 1_000;
    return accessToken;
  }
}
