import type { LessonStatus } from '../types';
import {
  availableStorage,
  isRecord,
  isTimestamp,
  LESSON_PROGRESS_SCHEMA,
  lessonProgressStorageKey,
  MAX_RECORD_LENGTH,
  safeId,
  statuses,
  type LessonExportData,
  type LessonPanelEvent,
  type LessonProgressExport,
  type LessonProgressState,
} from './progress-types';

function exportableProgress(value: unknown): LessonProgressExport | undefined {
  if (!isRecord(value) || typeof value.lessonId !== 'string' || !safeId.test(value.lessonId) || typeof value.status !== 'string' || !statuses.has(value.status as LessonStatus)) return undefined;
  if (!Array.isArray(value.completedConceptIds) || !Array.isArray(value.skippedChecks)) return undefined;
  const completedConceptIds = value.completedConceptIds.filter((id): id is string => typeof id === 'string' && safeId.test(id));
  const skippedChecks = value.skippedChecks.flatMap(item => isRecord(item) && typeof item.questionId === 'string' && safeId.test(item.questionId) && isTimestamp(item.at) ? [{ questionId: item.questionId, at: item.at }] : []);
  const result: LessonProgressExport = { lessonId: value.lessonId, status: value.status as LessonStatus, completedConceptIds: [...new Set(completedConceptIds)], skippedChecks };
  if (Number.isInteger(value.currentSectionIndex) && (value.currentSectionIndex as number) >= 0) result.currentSectionIndex = value.currentSectionIndex as number;
  if (Array.isArray(value.completedSectionIds)) result.completedSectionIds = [...new Set(value.completedSectionIds.filter((id): id is string => typeof id === 'string' && safeId.test(id)))];
  for (const field of ['learnStartedAt', 'learnDoneAt', 'practiceStartedAt'] as const) if (isTimestamp(value[field])) result[field] = value[field];
  if (isRecord(value.learnSkipped) && isTimestamp(value.learnSkipped.at)) result.learnSkipped = { at: value.learnSkipped.at };
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
    if (!isRecord(parsed) || parsed.schemaVersion !== LESSON_PROGRESS_SCHEMA || parsed.bankId !== bankId || parsed.bankVersion !== bankVersion || !isRecord(parsed.lessons) || !Array.isArray(parsed.lessonPanelEvents)) return { found: false };
    const lessonProgress = Object.values(parsed.lessons).map(exportableProgress).filter((progress): progress is LessonProgressExport => !!progress);
    const lessonPanelEvents = parsed.lessonPanelEvents.filter(event => isRecord(event) && typeof event.questionId === 'string' && safeId.test(event.questionId) && isTimestamp(event.openedAt) && isTimestamp(event.closedAt) && Date.parse(event.closedAt) >= Date.parse(event.openedAt)) as LessonPanelEvent[];
    return { found: true, data: { lessonProgress, lessonPanelEvents } };
  } catch { return { found: false }; }
}

export function lessonExportDataFromState(state: LessonProgressState): LessonExportData {
  return {
    lessonProgress: Object.values(state.progressById).map(exportableProgress).filter((progress): progress is LessonProgressExport => !!progress),
    lessonPanelEvents: state.lessonPanelEvents.map(event => ({ ...event })),
  };
}
