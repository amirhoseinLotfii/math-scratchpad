import type { LearnEvent, LearnEventType } from '../../sync/events';
import type { ReadingActivityType, ReadingPosition } from './reading-position-types';

/** Event types that represent a meaningful learning location change. */
const LOCATION_EVENT_TYPES = new Set<LearnEventType>([
  'lesson_open', 'lesson_close', 'chunk_open', 'chunk_read', 'section_open', 'section_close',
  'question_open', 'question_close', 'check_answer', 'check_skipped',
  'example_attempt', 'example_revealed', 'content_revealed', 'tryit_attempt', 'exercise_attempt',
  'step_open', 'step_close', 'step_added', 'step_edited', 'answer_edited',
  'concept_complete', 'lesson_complete', 'section_complete', 'practice_started', 'lesson_skip',
]);

export function isLocationLearnEvent(type: LearnEventType): boolean {
  return LOCATION_EVENT_TYPES.has(type);
}

export function activityFromLearnEvent(type: LearnEventType): ReadingActivityType {
  switch (type) {
    case 'example_attempt':
    case 'example_revealed':
      return 'example_viewed';
    case 'question_open':
    case 'practice_started':
    case 'exercise_attempt':
    case 'tryit_attempt':
      return 'exercise_started';
    case 'concept_complete':
    case 'section_complete':
    case 'lesson_complete':
      return 'exercise_completed';
    case 'step_added':
      return 'step_added';
    case 'step_edited':
    case 'answer_edited':
      return 'step_edited';
    case 'check_answer':
      return 'answer_submitted';
    default:
      return 'reading';
  }
}

function cleanId(value: string | undefined, fallback?: string): string | undefined {
  if (!value || value === 'unknown') return fallback;
  return value;
}

/** Build a position candidate from the latest learn event. */
export function readingPositionFromLearnEvent(event: LearnEvent): ReadingPosition | null {
  if (!isLocationLearnEvent(event.type)) return null;
  const lessonId = cleanId(event.lesson);
  if (!lessonId) return null;
  return {
    userId: event.deviceId,
    chapterId: event.chapter > 0 ? String(event.chapter) : undefined,
    lessonId,
    sectionId: cleanId(event.section),
    exerciseId: event.itemId,
    contentVersion: event.bankVersion,
    lastActivity: activityFromLearnEvent(event.type),
    updatedAt: new Date(event.ts),
    deviceMetadata: undefined,
  };
}

export function positionTimestamp(position: ReadingPosition | null | undefined): number {
  if (!position?.updatedAt) return 0;
  const value = position.updatedAt instanceof Date ? position.updatedAt.getTime() : Date.parse(String(position.updatedAt));
  return Number.isFinite(value) ? value : 0;
}

/** Keep only the newest activity; never let an older event overwrite a newer one. */
export function mergeLatestReadingPosition(
  current: ReadingPosition | null,
  incoming: ReadingPosition,
): ReadingPosition {
  if (!current) return incoming;
  if (positionTimestamp(incoming) < positionTimestamp(current)) return current;
  return {
    ...current,
    ...incoming,
    userId: incoming.userId || current.userId,
    contentVersion: incoming.contentVersion || current.contentVersion,
    lastActivity: incoming.lastActivity,
    updatedAt: incoming.updatedAt,
  };
}
