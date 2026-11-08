import { getLearningStorage } from '../../sync/browser-db';
import type { ReadingPosition } from './reading-position-types';

/** Single allowlisted key mirrored to authenticated server state. */
export const READING_POSITION_STORAGE_KEY = 'math-scratchpad-reading-position-v1';

type StoredReadingPosition = Omit<ReadingPosition, 'updatedAt'> & { updatedAt: string };

export function serializeReadingPosition(position: ReadingPosition): string {
  const stored: StoredReadingPosition = {
    ...position,
    updatedAt: position.updatedAt.toISOString(),
  };
  return JSON.stringify(stored);
}

export function deserializeReadingPosition(raw: string | null | undefined): ReadingPosition | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredReadingPosition;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.contentVersion !== 'string') return null;
    if (typeof parsed.lastActivity !== 'string' || typeof parsed.userId !== 'string') return null;
    const updatedAt = new Date(parsed.updatedAt);
    if (!Number.isFinite(updatedAt.getTime())) return null;
    return { ...parsed, updatedAt };
  } catch {
    return null;
  }
}

function storageOrNull(): Storage | null {
  try {
    return getLearningStorage();
  } catch {
    return null;
  }
}

export function readReadingPositionFromLearningStorage(): ReadingPosition | null {
  const storage = storageOrNull();
  if (!storage) return null;
  try {
    return deserializeReadingPosition(storage.getItem(READING_POSITION_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeReadingPositionToLearningStorage(position: ReadingPosition): void {
  const storage = storageOrNull();
  if (!storage) return;
  storage.setItem(READING_POSITION_STORAGE_KEY, serializeReadingPosition(position));
}

export function clearReadingPositionFromLearningStorage(): void {
  const storage = storageOrNull();
  if (!storage) return;
  try {
    storage.removeItem(READING_POSITION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
