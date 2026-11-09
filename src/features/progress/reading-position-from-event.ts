import type { LearnEvent, LearnEventType } from '../../sync/events';
import type { ReadingActivityType, ReadingPosition } from './reading-position-types';
import { conceptAnchorId, sectionAnchorId } from './reading-position-anchors';

/** Event types that represent a meaningful learning location change. */
const LOCATION_EVENT_TYPES = new Set<LearnEventType>([
  'lesson_open', 'chunk_open', 'chunk_read', 'section_open', 'section_close',
  'question_open', 'question_close', 'check_answer', 'check_skipped',
  'example_attempt', 'example_revealed', 'content_revealed', 'tryit_attempt', 'exercise_attempt',
  'step_open', 'step_close', 'step_added', 'step_edited', 'answer_edited',
  'concept_complete', 'lesson_complete', 'section_complete', 'practice_started', 'lesson_skip',
]);

/** Only these event types carry an actual exercise/question identifier in itemId. */
const EXERCISE_EVENT_TYPES = new Set<LearnEventType>([
  'question_open', 'question_close', 'check_answer', 'check_skipped',
  'tryit_attempt', 'exercise_attempt', 'step_open', 'step_close',
  'step_added', 'step_edited', 'answer_edited',
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
  const sectionId = cleanId(event.section);
  const conceptId = cleanId(event.concept);
  return {
    userId: event.deviceId,
    chapterId: event.chapter > 0 ? String(event.chapter) : undefined,
    lessonId,
    sectionId,
    // itemId is generic: on section/chunk events it is not an exercise id.
    contentAnchorId: conceptId ? conceptAnchorId(conceptId) : sectionId ? sectionAnchorId(sectionId) : undefined,
    exerciseId: EXERCISE_EVENT_TYPES.has(event.type) ? cleanId(event.itemId) : undefined,
    contentVersion: event.bankVersion,
    lastActivity: activityFromLearnEvent(event.type),
    updatedAt: new Date(event.ts),
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

  const hasIncoming = (field: keyof ReadingPosition) => Object.prototype.hasOwnProperty.call(incoming, field);
  const chapterChanged = incoming.chapterId !== undefined && incoming.chapterId !== current.chapterId;
  const lessonChanged = chapterChanged || (incoming.lessonId !== undefined && incoming.lessonId !== current.lessonId);
  const sectionChanged = lessonChanged || (incoming.sectionId !== undefined && incoming.sectionId !== current.sectionId);
  const exerciseChanged = sectionChanged || (hasIncoming('exerciseId') && incoming.exerciseId !== current.exerciseId);
  const versionChanged = !!incoming.contentVersion && incoming.contentVersion !== current.contentVersion;
  const clearSectionPosition = sectionChanged || versionChanged;
  const definedIncoming = Object.fromEntries(
    Object.entries(incoming).filter(([, value]) => value !== undefined),
  ) as Partial<ReadingPosition>;

  return {
    ...current,
    ...definedIncoming,
    userId: incoming.userId || current.userId,
    chapterId: incoming.chapterId ?? current.chapterId,
    lessonId: incoming.lessonId ?? (chapterChanged ? undefined : current.lessonId),
    sectionId: incoming.sectionId ?? (lessonChanged ? undefined : current.sectionId),
    contentAnchorId: hasIncoming('contentAnchorId')
      ? incoming.contentAnchorId
      : clearSectionPosition ? undefined : current.contentAnchorId,
    exerciseId: hasIncoming('exerciseId')
      ? incoming.exerciseId
      : sectionChanged ? undefined : current.exerciseId,
    stepId: incoming.stepId ?? (exerciseChanged ? undefined : current.stepId),
    scrollOffset: incoming.scrollOffset ?? (clearSectionPosition ? undefined : current.scrollOffset),
    relativeOffset: incoming.relativeOffset ?? (clearSectionPosition ? undefined : current.relativeOffset),
    deviceMetadata: incoming.deviceMetadata ?? (clearSectionPosition ? undefined : current.deviceMetadata),
    contentVersion: incoming.contentVersion || current.contentVersion,
    lastActivity: incoming.lastActivity,
    updatedAt: incoming.updatedAt,
  };
}
