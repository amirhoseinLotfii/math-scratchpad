import { DRIVE_BATCH_API, DRIVE_FILES_API, FOLDER_MIME_TYPE } from './config';
import {
  DriveMirrorError,
  type DriveFetch,
  type DriveFileMetadata,
  type DriveFolderChild,
  type DriveMirrorKind,
  type DriveRequestStage,
} from './types';
import { hasLearningMirrorOwnership, parseAppProperties } from './ownership';
import { readJson, parseJsonText, parseSingleDriveBatchResponse, escapeQuery, errorForStatus, utf8Length } from './http';

export class DriveFolders {
  constructor(
    private readonly apiFetch: DriveFetch,
    private readonly readFileMetadata: (id: string, fields: string) => Promise<Record<string, unknown>>,
    private readonly recordStage: (stage: string) => void,
  ) {}
  async ensureFolder(name: string, parentId: string): Promise<string> {
    const query = new URLSearchParams({
      q:
        `name = '${escapeQuery(name)}' and mimeType = '${FOLDER_MIME_TYPE}' ` +
        `and '${escapeQuery(parentId)}' in parents and trashed = false`,
      spaces: 'drive',
      pageSize: '1000',
      fields: 'nextPageToken,files(id,name,mimeType,parents)',
    });
    const matches = await this.listFiles(query, (file) => file.name === name && file.mimeType === FOLDER_MIME_TYPE, 'drive_folder_lookup');
    if (matches.length > 1) throw new DriveMirrorError('duplicate_file');
    if (matches.length === 1 && typeof matches[0].id === 'string') return matches[0].id;

    const created = await this.apiFetch(`${DRIVE_FILES_API}?fields=id,name,mimeType,parents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME_TYPE, parents: [parentId] }),
    });
    if (!created.ok) throw errorForStatus(created.status);
    const folder = await readJson<DriveFileMetadata>(created);
    if (
      typeof folder.id !== 'string' ||
      folder.name !== name ||
      folder.mimeType !== FOLDER_MIME_TYPE ||
      !Array.isArray(folder.parents) ||
      !folder.parents.includes(parentId)
    ) {
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
      q:
        `name = '${escapeQuery(name)}' and mimeType = '${FOLDER_MIME_TYPE}' ` +
        `and '${escapeQuery(parentId)}' in parents and trashed = false`,
      spaces: 'drive',
      pageSize: '1000',
      fields: 'nextPageToken,incompleteSearch,files(id,name,mimeType,parents,trashed)',
    });
    const matches = await this.listFiles(
      query,
      (file) =>
        file.name === name &&
        file.mimeType === FOLDER_MIME_TYPE &&
        file.trashed !== true &&
        Array.isArray(file.parents) &&
        file.parents.includes(parentId),
      'drive_folder_lookup',
    );
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
      fields: 'nextPageToken,incompleteSearch,files(id,name,mimeType,parents,trashed,appProperties)',
    });
    const files = await this.listFiles(
      query,
      (file) => file.trashed !== true && Array.isArray(file.parents) && file.parents.includes(parentId),
      'drive_file_lookup',
    );
    return files.map((file) => {
      if (
        typeof file.id !== 'string' ||
        !file.id ||
        typeof file.name !== 'string' ||
        typeof file.mimeType !== 'string' ||
        !Array.isArray(file.parents) ||
        !file.parents.every((parent) => typeof parent === 'string')
      ) {
        throw new DriveMirrorError('invalid_response');
      }
      const appProperties = parseAppProperties(file.appProperties);
      return {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        parents: file.parents as string[],
        ...(appProperties ? { appProperties } : {}),
      };
    });
  }

  /** Move a verified direct child file to Drive trash; never deletes folders. */
  async trashFileInFolder(id: string, parentId: string, expectedKind: DriveMirrorKind): Promise<boolean> {
    const metadata = await this.readFileMetadata(id, 'id,mimeType,parents,trashed,appProperties');
    const parents = metadata.parents;
    if (
      metadata.id !== id ||
      metadata.trashed === true ||
      metadata.mimeType === FOLDER_MIME_TYPE ||
      !Array.isArray(parents) ||
      !parents.includes(parentId)
    ) {
      if (metadata.trashed === true) return false;
      throw new DriveMirrorError('invalid_response');
    }
    if (!hasLearningMirrorOwnership(metadata.appProperties, expectedKind)) return false;
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
    const response = await this.apiFetch(
      DRIVE_BATCH_API,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/mixed; boundary=${boundary}` },
        body: batchBody,
      },
      'drive_trash',
    );
    if (!response.ok) throw errorForStatus(response.status);
    const batchContent = new TextDecoder().decode(await response.arrayBuffer());
    const batchResult = parseSingleDriveBatchResponse(response.headers.get('Content-Type'), batchContent);
    this.recordStage(`drive_trash_batch_http_${batchResult.status}`);
    if (batchResult.status < 200 || batchResult.status >= 300) throw errorForStatus(batchResult.status);
    const trashed = parseJsonText<DriveFileMetadata>(batchResult.body);
    if (trashed.id !== id || trashed.trashed !== true || !Array.isArray(trashed.parents) || !trashed.parents.includes(parentId)) {
      throw new DriveMirrorError('invalid_response');
    }
    return true;
  }

  async findFile(name: string, parentId: string, mimeType: string): Promise<string | undefined> {
    const query = new URLSearchParams({
      q:
        `name = '${escapeQuery(name)}' and mimeType = '${escapeQuery(mimeType)}' ` +
        `and '${escapeQuery(parentId)}' in parents and trashed = false`,
      spaces: 'drive',
      pageSize: '1000',
      fields: 'nextPageToken,files(id,name,mimeType,parents)',
    });
    const matches = await this.listFiles(query, (file) => file.name === name && file.mimeType === mimeType, 'drive_file_lookup');
    if (matches.length > 1) throw new DriveMirrorError('duplicate_file');
    const id = matches[0]?.id;
    if (typeof id !== 'string') return undefined;
    return id;
  }

  async findFileIds(name: string, parentId: string, mimeType: string): Promise<string[]> {
    const query = new URLSearchParams({
      q:
        `name = '${escapeQuery(name)}' and mimeType = '${escapeQuery(mimeType)}' ` +
        `and '${escapeQuery(parentId)}' in parents and trashed = false`,
      spaces: 'drive',
      pageSize: '1000',
      fields: 'nextPageToken,incompleteSearch,files(id,name,mimeType,parents)',
    });
    const matches = await this.listFiles(
      query,
      (file) => file.name === name && file.mimeType === mimeType && Array.isArray(file.parents) && file.parents.includes(parentId),
      'drive_file_lookup',
    );
    const ids = matches.map((file) => file.id);
    if (ids.some((id) => typeof id !== 'string' || id.length === 0)) throw new DriveMirrorError('invalid_response');
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
      const page = data.files.filter((file): file is DriveFileMetadata =>
        Boolean(file && typeof file === 'object' && !Array.isArray(file)),
      );
      found.push(...page.filter(matches));
      const next = data.nextPageToken;
      if (typeof next !== 'string' || !next) break;
      if (seenTokens.has(next)) throw new DriveMirrorError('invalid_response');
      seenTokens.add(next);
      pageToken = next;
    } while (true);
    return found;
  }
}
