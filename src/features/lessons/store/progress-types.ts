import { getLearningStorage } from '../../../sync/browser-db';
import type { LessonProgress, LessonStatus } from '../types';

export const LESSON_PROGRESS_PREFIX = 'math-scratchpad-lesson-progress-v1';
export const LESSON_PROGRESS_SCHEMA = 1;
export const MAX_RECORD_LENGTH = 1_000_000;
export const safeId = /^[\w.-]{1,80}$/;
export const timestampPattern = /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/;
export const statuses = new Set<LessonStatus>(['learning', 'practising', 'done']);

export type LessonPanelEvent = { questionId: string; openedAt: string; closedAt: string };
export type ActiveLessonPanel = { questionId: string; openedAt: string };
export type LessonProgressState = {
  bankId: string;
  bankVersion: string;
  progressById: Record<string, LessonProgress>;
  lessonPanelEvents: LessonPanelEvent[];
  activePanelEvent?: ActiveLessonPanel;
  persistenceBlocked: boolean;
  warning: string;
  found: boolean;
};
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && timestampPattern.test(value) && Number.isFinite(Date.parse(value));
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
