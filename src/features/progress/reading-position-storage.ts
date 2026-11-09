import { getLearningStorage } from '../../sync/browser-db';
import type { ReadingActivityType, ReadingPosition } from './reading-position-types';

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

const READING_ACTIVITIES = new Set<ReadingActivityType>([
  'reading',
  'exercise_started',
  'exercise_completed',
  'example_viewed',
  'step_added',
  'step_edited',
  'answer_submitted',
]);

export function deserializeReadingPosition(raw: string | null | undefined): ReadingPosition | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredReadingPosition;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (typeof parsed.userId !== 'string' || !parsed.userId.trim()) return null;
    if (typeof parsed.contentVersion !== 'string' || typeof parsed.lastActivity !== 'string') return null;
    if (!READING_ACTIVITIES.has(parsed.lastActivity as ReadingActivityType)) return null;
    if (typeof parsed.updatedAt !== 'string') return null;

    for (const key of ['chapterId', 'lessonId', 'sectionId', 'contentAnchorId', 'exerciseId', 'stepId'] as const) {
      const value = parsed[key];
      if (value !== undefined && typeof value !== 'string') return null;
    }
    if (parsed.scrollOffset !== undefined && (!Number.isFinite(parsed.scrollOffset) || parsed.scrollOffset < 0)) return null;
    if (parsed.relativeOffset !== undefined && (!Number.isFinite(parsed.relativeOffset) || parsed.relativeOffset < 0 || parsed.relativeOffset > 1)) return null;
    if (parsed.deviceMetadata !== undefined) {
      const metadata = parsed.deviceMetadata;
      if (!metadata || typeof metadata !== 'object'
        || !Number.isFinite(metadata.viewportWidth) || metadata.viewportWidth <= 0
        || !Number.isFinite(metadata.viewportHeight) || metadata.viewportHeight <= 0
        || (metadata.userAgent !== undefined && typeof metadata.userAgent !== 'string')) return null;
    }

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
