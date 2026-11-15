import { DriveMirrorError } from './types';
import { DRIVE_GET_RETRY_BASE_DELAY_MS } from './config';

export function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function parseSingleDriveBatchResponse(contentType: string | null, content: string): { status: number; body: string } {
  const boundary = contentType?.match(/(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))/i);
  const boundaryValue = boundary?.[1] ?? boundary?.[2];
  if (!boundaryValue) throw new DriveMirrorError('invalid_response');

  const parts = content
    .split(`--${boundaryValue}`)
    .map((part) => part.trim())
    .filter((part) => part && part !== '--');
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

export function parseJsonText<T>(content: string): T {
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new DriveMirrorError('invalid_response');
  }
}

export function errorForStatus(status: number): DriveMirrorError {
  if (status === 401) return new DriveMirrorError('reauthorization_required');
  if (status === 403) return new DriveMirrorError('permission_denied');
  if (status === 404) return new DriveMirrorError('permission_denied');
  if (status === 409 || status === 412) return new DriveMirrorError('etag_conflict');
  if (status === 429 || status === 507) return new DriveMirrorError('quota_exceeded');
  if (status >= 500) return new DriveMirrorError('network_error');
  return new DriveMirrorError('invalid_response');
}

export function waitForDriveRetry(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, DRIVE_GET_RETRY_BASE_DELAY_MS * 2 ** attempt));
}

export async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new DriveMirrorError('invalid_response');
  }
}

export function utf8Length(content: string): number {
  return new TextEncoder().encode(content).byteLength;
}
