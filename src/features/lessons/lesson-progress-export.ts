import { type LessonProgress, type LessonStatus } from './types';
import { getLearningStorage } from '../../sync/browser-db';

import type { LessonPanelEvent, LessonProgressState } from './lesson-progress-store';
import { LESSON_PROGRESS_SCHEMA, lessonProgressStorageKey } from './lesson-progress-store';
const MAX_RECORD_LENGTH = 1_000_000;
const safeId = /^[\w.-]{1,80}$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/;
const statuses = new Set<LessonStatus>(['learning', 'practising', 'done']);

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function timestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && timestampPattern.test(value) && Number.isFinite(Date.parse(value));
}
function availableStorage(storage?: Storage): Storage | null {
  try {
    return storage ?? getLearningStorage();
  } catch {
    return null;
  }
}

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

function exportableProgress(value: unknown): LessonProgressExport | undefined {
  if (
    !record(value) ||
    typeof value.lessonId !== 'string' ||
    !safeId.test(value.lessonId) ||
    typeof value.status !== 'string' ||
    !statuses.has(value.status as LessonStatus)
  )
    return undefined;
  if (!Array.isArray(value.completedConceptIds) || !Array.isArray(value.skippedChecks)) return undefined;
  const completedConceptIds = value.completedConceptIds.filter((id): id is string => typeof id === 'string' && safeId.test(id));
  const skippedChecks = value.skippedChecks.flatMap((item) =>
    record(item) && typeof item.questionId === 'string' && safeId.test(item.questionId) && timestamp(item.at)
      ? [{ questionId: item.questionId, at: item.at }]
      : [],
  );
  const result: LessonProgressExport = {
    lessonId: value.lessonId,
    status: value.status as LessonStatus,
    completedConceptIds: [...new Set(completedConceptIds)],
    skippedChecks,
  };
  if (Number.isInteger(value.currentSectionIndex) && (value.currentSectionIndex as number) >= 0)
    result.currentSectionIndex = value.currentSectionIndex as number;
  if (Array.isArray(value.completedSectionIds))
    result.completedSectionIds = [
      ...new Set(value.completedSectionIds.filter((id): id is string => typeof id === 'string' && safeId.test(id))),
    ];
  for (const field of ['learnStartedAt', 'learnDoneAt', 'practiceStartedAt'] as const)
    if (timestamp(value[field])) result[field] = value[field];
  if (record(value.learnSkipped) && timestamp(value.learnSkipped.at)) result.learnSkipped = { at: value.learnSkipped.at };
  return result;
}

/** Reads only the export-safe progress fields; Learn check responses never leave the separate store. */
export function readLessonExportData(bankId: string, bankVersion: string, storage?: Storage): { found: boolean; data?: LessonExportData } {
  const target = availableStorage(storage);
  if (!target) return { found: false };
  try {
    const raw = target.getItem(lessonProgressStorageKey(bankId, bankVersion));
    if (!raw || raw.length > MAX_RECORD_LENGTH) return { found: false };
    const parsed: unknown = JSON.parse(raw);
    if (
      !record(parsed) ||
      parsed.schemaVersion !== LESSON_PROGRESS_SCHEMA ||
      parsed.bankId !== bankId ||
      parsed.bankVersion !== bankVersion ||
      !record(parsed.lessons) ||
      !Array.isArray(parsed.lessonPanelEvents)
    )
      return { found: false };
    const lessonProgress = Object.values(parsed.lessons)
      .map(exportableProgress)
      .filter((progress): progress is LessonProgressExport => !!progress);
    const lessonPanelEvents = parsed.lessonPanelEvents.filter(
      (event) =>
        record(event) &&
        typeof event.questionId === 'string' &&
        safeId.test(event.questionId) &&
        timestamp(event.openedAt) &&
        timestamp(event.closedAt) &&
        Date.parse(event.closedAt) >= Date.parse(event.openedAt),
    ) as LessonPanelEvent[];
    return { found: true, data: { lessonProgress, lessonPanelEvents } };
  } catch {
    return { found: false };
  }
}

export function lessonExportDataFromState(state: LessonProgressState): LessonExportData {
  return {
    lessonProgress: Object.values(state.progressById)
      .map(exportableProgress)
      .filter((progress): progress is LessonProgressExport => !!progress),
    lessonPanelEvents: state.lessonPanelEvents.map((event) => ({ ...event })),
  };
}
