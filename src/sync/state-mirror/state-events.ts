import {
  SERVER_STORAGE_CONFLICT_EVENT,
  SERVER_STORAGE_SNAPSHOT_REQUEST_EVENT,
  type ServerStorageConflict,
  type ServerStorageSnapshotRequest,
} from './state-api';

export function latestLocalValue(key: string, fallback: string | null): string | null {
  if (typeof globalThis.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') return fallback;
  const detail: ServerStorageSnapshotRequest = { key, value: fallback, provided: false };
  try {
    globalThis.dispatchEvent(new CustomEvent(SERVER_STORAGE_SNAPSHOT_REQUEST_EVENT, { detail }));
  } catch {
    return fallback;
  }
  return detail.provided && (typeof detail.value === 'string' || detail.value === null) ? detail.value : fallback;
}

export function dispatchConflict(conflict: ServerStorageConflict) {
  if (typeof globalThis.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') return;
  globalThis.dispatchEvent(new CustomEvent(SERVER_STORAGE_CONFLICT_EVENT, { detail: conflict }));
}
