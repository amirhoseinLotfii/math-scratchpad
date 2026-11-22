import {
  isRecord,
  isTimestamp,
  LESSON_PROGRESS_SCHEMA,
  MAX_RECORD_LENGTH,
  safeProgressId,
  statuses,
  timestampPattern,
  type ActiveLessonPanel,
  type LessonPanelEvent,
  type LessonProgress,
  type LessonProgressState,
} from '../../../domain/entities/lesson-progress.types';
import { LESSON_PROGRESS_PREFIX } from '../../../shared/lib/storage-keys';
import { getLearningStorage } from '../../../sync/browser-db';

export {
  isRecord,
  isTimestamp,
  LESSON_PROGRESS_PREFIX,
  LESSON_PROGRESS_SCHEMA,
  MAX_RECORD_LENGTH,
  statuses,
  timestampPattern,
  type ActiveLessonPanel,
  type LessonPanelEvent,
  type LessonProgressState,
};
export const safeId = safeProgressId;

export type LessonProgressExport = Pick<
  LessonProgress,
  | 'lessonId'
  | 'status'
  | 'currentSectionIndex'
  | 'completedSectionIds'
  | 'completedConceptIds'
  | 'learnStartedAt'
  | 'skippedChecks'
  | 'learnSkipped'
  | 'learnDoneAt'
  | 'practiceStartedAt'
>;
export type LessonExportData = { lessonProgress: LessonProgressExport[]; lessonPanelEvents: LessonPanelEvent[] };

export function lessonProgressStorageKey(bankId: string, bankVersion: string) {
  return `${LESSON_PROGRESS_PREFIX}:${encodeURIComponent(bankId)}:${encodeURIComponent(bankVersion)}`;
}

export function emptyLessonProgressState(bankId: string, bankVersion: string): LessonProgressState {
  return { bankId, bankVersion, progressById: {}, lessonPanelEvents: [], persistenceBlocked: false, warning: '', found: false };
}

export function declaredVersionNumber(value: string): number | undefined {
  const match = value.match(/(?:^|[-_])v(\d+)(?:[-_]|$)/i) ?? value.match(/^v(\d+)$/i);
  return match ? Number(match[1]) : undefined;
}

export function nowTimestamp() {
  return new Date().toISOString();
}

export function availableStorage(storage?: Storage): Storage | null {
  try { return storage ?? getLearningStorage(); } catch { return null; }
}
