import { DRIVE_FILES_API, DRIVE_UPLOAD_API, MULTIPART_UPLOAD_LIMIT_BYTES, SIMPLE_UPLOAD_LIMIT_BYTES } from './config';
import {
  DriveMirrorError,
  type DriveFileRef,
  type DriveFileContent,
  type DriveFileMetadata,
  type DriveMirrorKind,
  type DriveFetch,
} from './types';
import { mirrorAppProperties, mirrorKindForName, hasLearningMirrorOwnership } from './ownership';
import { readJson, errorForStatus, utf8Length } from './http';

export async function createSnapshotFile(
  fetch: DriveFetch,
  name: string,
  parentId: string,
  mimeType: string,
  content: string,
  kind: DriveMirrorKind | 'other',
): Promise<string> {
  const appProperties = mirrorAppProperties(kind);
  const fields = 'id,name,mimeType,parents,appProperties';
  let response: Response;
  if (utf8Length(content) > MULTIPART_UPLOAD_LIMIT_BYTES) {
    response = await resumableUpload(fetch, {
      url: `${DRIVE_UPLOAD_API}?uploadType=resumable&fields=${encodeURIComponent(fields)}`,
      method: 'POST',
      mimeType,
      content,
      metadata: { name, mimeType, parents: [parentId], appProperties },
    });
  } else {
    const boundary = `mathscratchpad_${crypto.randomUUID().replace(/-/g, '')}`;
    const metadata = JSON.stringify({ name, mimeType, parents: [parentId], appProperties });
    const body = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n`,
      `--${boundary}--`,
    ].join('');
    response = await fetch(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=${encodeURIComponent(fields)}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
  }
  if (!response.ok) throw errorForStatus(response.status);
  const file = await readJson<DriveFileMetadata>(response);
  if (
    typeof file.id !== 'string' ||
    file.name !== name ||
    file.mimeType !== mimeType ||
    !Array.isArray(file.parents) ||
    !file.parents.includes(parentId) ||
    !hasLearningMirrorOwnership(file.appProperties, kind)
  ) {
    throw new DriveMirrorError('invalid_response');
  }
  return file.id;
}

export async function createTextFile(
  fetch: DriveFetch,
  name: string,
  parentId: string,
  mimeType: string,
  content: string,
): Promise<DriveFileContent> {
  const kind = mirrorKindForName(name);
  const appProperties = mirrorAppProperties(kind);
  const fields = 'id,name,mimeType,parents,appProperties';
  if (utf8Length(content) > MULTIPART_UPLOAD_LIMIT_BYTES) {
    const response = await resumableUpload(fetch, {
      url: `${DRIVE_UPLOAD_API}?uploadType=resumable&fields=${encodeURIComponent(fields)}`,
      method: 'POST',
      mimeType,
      content,
      metadata: { name, mimeType, parents: [parentId], appProperties },
    });
    if (!response.ok) throw errorForStatus(response.status);
    const file = await readJson<DriveFileMetadata>(response);
    if (
      typeof file.id !== 'string' ||
      file.name !== name ||
      file.mimeType !== mimeType ||
      !Array.isArray(file.parents) ||
      !file.parents.includes(parentId) ||
      !hasLearningMirrorOwnership(file.appProperties, kind)
    ) {
      throw new DriveMirrorError('invalid_response');
    }
    const etag = response.headers.get('ETag');
    if (etag) return { id: file.id, etag, content };
    const verified = await readTextFile(fetch, file.id);
    if (verified.content !== content) throw new DriveMirrorError('invalid_response');
    return verified;
  }

  const boundary = `mathscratchpad_${crypto.randomUUID().replace(/-/g, '')}`;
  const metadata = JSON.stringify({ name, mimeType, parents: [parentId], appProperties });
  const body = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n`,
    `--${boundary}--`,
  ].join('');
  const response = await fetch(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=${encodeURIComponent(fields)}`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!response.ok) throw errorForStatus(response.status);
  const file = await readJson<DriveFileMetadata>(response);
  if (
    typeof file.id !== 'string' ||
    file.name !== name ||
    file.mimeType !== mimeType ||
    !Array.isArray(file.parents) ||
    !file.parents.includes(parentId) ||
    !hasLearningMirrorOwnership(file.appProperties, kind)
  ) {
    throw new DriveMirrorError('invalid_response');
  }
  const etag = response.headers.get('ETag');
  if (etag) return { id: file.id, etag, content };
  const verified = await readTextFile(fetch, file.id);
  if (verified.content !== content) throw new DriveMirrorError('invalid_response');
  return verified;
}

export async function updateTextFile(fetch: DriveFetch, file: DriveFileRef, mimeType: string, content: string): Promise<Response> {
  if (utf8Length(content) <= SIMPLE_UPLOAD_LIMIT_BYTES) {
    return fetch(`${DRIVE_UPLOAD_API}/${encodeURIComponent(file.id)}?uploadType=media&fields=id,name,modifiedTime`, {
      method: 'PATCH',
      headers: { 'Content-Type': mimeType, 'If-Match': file.etag },
      body: content,
    });
  }
  return resumableUpload(fetch, {
    url: `${DRIVE_UPLOAD_API}/${encodeURIComponent(file.id)}?uploadType=resumable&fields=id,name,modifiedTime`,
    method: 'PATCH',
    mimeType,
    content,
    ifMatch: file.etag,
  });
}

export async function resumableUpload(
  fetch: DriveFetch,
  input: {
    url: string;
    method: 'POST' | 'PATCH';
    mimeType: string;
    content: string;
    metadata?: Record<string, unknown>;
    ifMatch?: string;
  },
): Promise<Response> {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Upload-Content-Type': input.mimeType,
    'X-Upload-Content-Length': String(utf8Length(input.content)),
  });
  if (input.ifMatch) headers.set('If-Match', input.ifMatch);
  const initiated = await fetch(input.url, {
    method: input.method,
    headers,
    ...(input.metadata ? { body: JSON.stringify(input.metadata) } : {}),
  });
  if (!initiated.ok) return initiated;
  const location = initiated.headers.get('Location');
  if (!location) throw new DriveMirrorError('invalid_response');
  let uploadUrl: URL;
  try {
    uploadUrl = new URL(location);
  } catch {
    throw new DriveMirrorError('invalid_response');
  }
  if (uploadUrl.origin !== 'https://www.googleapis.com' || uploadUrl.pathname !== '/upload/drive/v3/files') {
    throw new DriveMirrorError('invalid_response');
  }
  return fetch(uploadUrl.toString(), {
    method: 'PUT',
    headers: { 'Content-Type': input.mimeType },
    body: input.content,
  });
}

export async function readTextFile(fetch: DriveFetch, id: string): Promise<DriveFileContent> {
  const response = await fetch(`${DRIVE_FILES_API}/${encodeURIComponent(id)}?alt=media`, { method: 'GET' }, 'drive_file_read');
  if (!response.ok) throw errorForStatus(response.status);
  const etag = response.headers.get('ETag');
  if (!etag) throw new DriveMirrorError('invalid_response');
  return { id, etag, content: await response.text() };
}
