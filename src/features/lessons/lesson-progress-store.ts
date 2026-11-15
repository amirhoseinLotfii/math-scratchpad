import { normalizeProgress } from './normalize-lesson-progress';
import type { DriveBank } from '../drive-bank/drive-bank';
import { type LessonProgress, type LessonStatus } from './types';
import { getLearningStorage } from '../../sync/browser-db';

export const LESSON_PROGRESS_PREFIX = 'math-scratchpad-lesson-progress-v1';
export const LESSON_PROGRESS_SCHEMA = 1;
const MAX_RECORD_LENGTH = 1_000_000;
const safeId = /^[\w.-]{1,80}$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/;
const statuses = new Set<LessonStatus>(['learning', 'practising', 'done']);

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
export function lessonProgressStorageKey(bankId: string, bankVersion: string) {
  return `${LESSON_PROGRESS_PREFIX}:${encodeURIComponent(bankId)}:${encodeURIComponent(bankVersion)}`;
}

export function emptyLessonProgressState(bankId: string, bankVersion: string): LessonProgressState {
  return { bankId, bankVersion, progressById: {}, lessonPanelEvents: [], persistenceBlocked: false, warning: '', found: false };
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function timestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && timestampPattern.test(value) && Number.isFinite(Date.parse(value));
}
function declaredVersionNumber(value: string): number | undefined {
  const match = value.match(/(?:^|[-_])v(\d+)(?:[-_]|$)/i) ?? value.match(/^v(\d+)$/i);
  return match ? Number(match[1]) : undefined;
}
function nowTimestamp() {
  return new Date().toISOString();
}
function validPanelEvent(value: unknown, bank: DriveBank): value is LessonPanelEvent {
  if (!record(value) || typeof value.questionId !== 'string' || !timestamp(value.openedAt) || !timestamp(value.closedAt)) return false;
  const question = bank.questions.find((item) => item.id === value.questionId);
  return !!question && question.stage !== 'learn' && !!question.lessonId && Date.parse(value.closedAt) >= Date.parse(value.openedAt);
}
function validActivePanel(value: unknown, bank: DriveBank): value is ActiveLessonPanel {
  if (!record(value) || typeof value.questionId !== 'string' || !timestamp(value.openedAt)) return false;
  const question = bank.questions.find((item) => item.id === value.questionId);
  return !!question && question.stage !== 'learn' && !!question.lessonId;
}

function availableStorage(storage?: Storage): Storage | null {
  try {
    return storage ?? getLearningStorage();
  } catch {
    return null;
  }
}

export function readLessonProgress(bank: DriveBank, bankVersion: string, storage?: Storage, now = nowTimestamp()): LessonProgressState {
  const state = emptyLessonProgressState(bank.bank_id, bankVersion);
  const target = availableStorage(storage);
  if (!target)
    return {
      ...state,
      persistenceBlocked: true,
      warning: 'Learn progress storage is unavailable. Progress will remain in memory until this page closes.',
    };
  let raw: string | null;
  try {
    raw = target.getItem(lessonProgressStorageKey(bank.bank_id, bankVersion));
  } catch {
    return {
      ...state,
      persistenceBlocked: true,
      warning: 'Learn progress could not be read. Existing data was left untouched; new progress will remain in memory.',
    };
  }
  if (raw === null) return migratePreviousProgress(bank, bankVersion, target, now) ?? state;
  state.found = true;
  if (raw.length > MAX_RECORD_LENGTH)
    return {
      ...state,
      persistenceBlocked: true,
      warning: 'Saved Learn progress is too large to validate. It was left untouched; this lesson starts fresh in memory.',
    };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ...state,
      persistenceBlocked: true,
      warning: 'Saved Learn progress is invalid. It was left untouched; this lesson starts fresh in memory.',
    };
  }
  if (
    !record(parsed) ||
    parsed.schemaVersion !== LESSON_PROGRESS_SCHEMA ||
    parsed.bankId !== bank.bank_id ||
    parsed.bankVersion !== bankVersion ||
    !record(parsed.lessons) ||
    !Array.isArray(parsed.lessonPanelEvents)
  ) {
    return {
      ...state,
      persistenceBlocked: true,
      warning: 'Saved Learn progress belongs to another bank version or format. It was left untouched; this lesson starts fresh in memory.',
    };
  }
  const lessons = new Map((bank.lessons ?? []).map((lesson) => [lesson.id, lesson]));
  const questions = new Map(bank.questions.map((question) => [question.id, question]));
  let degraded = false;
  for (const [lessonId, rawProgress] of Object.entries(parsed.lessons)) {
    const lesson = lessons.get(lessonId);
    if (!lesson) {
      degraded = true;
      continue;
    }
    const progress = normalizeProgress(rawProgress, lesson, questions);
    if (progress) state.progressById[lessonId] = progress;
    else degraded = true;
  }
  state.lessonPanelEvents = parsed.lessonPanelEvents.filter((event) => validPanelEvent(event, bank));
  if (state.lessonPanelEvents.length !== parsed.lessonPanelEvents.length) degraded = true;
  if (parsed.activePanel !== undefined) {
    if (validActivePanel(parsed.activePanel, bank)) {
      state.activePanelEvent = { questionId: parsed.activePanel.questionId, openedAt: parsed.activePanel.openedAt };
      state.lessonPanelEvents.push({ ...state.activePanelEvent, closedAt: now });
      state.activePanelEvent = undefined;
    } else degraded = true;
  }
  if (degraded) {
    state.persistenceBlocked = true;
    state.warning = 'Some saved Learn progress is stale or invalid. Valid progress was restored; the saved record was left untouched.';
  } else if (parsed.activePanel !== undefined) {
    const result = saveLessonProgress(bank, bankVersion, state, target);
    if (!result.saved) state.warning = result.message;
  }
  return state;
}

export function saveLessonProgress(
  bank: DriveBank,
  bankVersion: string,
  state: LessonProgressState,
  storage?: Storage,
): { saved: boolean; message: string } {
  if (state.persistenceBlocked)
    return { saved: false, message: state.warning || 'Saved Learn progress is protected and was not overwritten.' };
  const target = availableStorage(storage);
  if (!target) return { saved: false, message: 'Learn progress could not be saved; it remains available only until this page closes.' };
  const lessons: Record<string, LessonProgress> = {};
  const lessonById = new Map((bank.lessons ?? []).map((lesson) => [lesson.id, lesson]));
  const questionById = new Map(bank.questions.map((question) => [question.id, question]));
  for (const [lessonId, progress] of Object.entries(state.progressById)) {
    const lesson = lessonById.get(lessonId);
    const normalized = lesson && normalizeProgress(progress, lesson, questionById);
    if (!normalized) return { saved: false, message: 'Learn progress could not be validated and was not written.' };
    lessons[lessonId] = normalized;
  }
  const events = state.lessonPanelEvents.filter((event) => validPanelEvent(event, bank));
  if (events.length !== state.lessonPanelEvents.length || (state.activePanelEvent && !validActivePanel(state.activePanelEvent, bank))) {
    return { saved: false, message: 'Lesson reference history could not be validated and was not written.' };
  }
  const payload = {
    schemaVersion: LESSON_PROGRESS_SCHEMA,
    bankId: bank.bank_id,
    bankVersion,
    updatedAt: nowTimestamp(),
    lessons,
    lessonPanelEvents: events,
    ...(state.activePanelEvent ? { activePanel: state.activePanelEvent } : {}),
  };
  const serialized = JSON.stringify(payload);
  if (serialized.length > MAX_RECORD_LENGTH)
    return { saved: false, message: 'Learn progress is too large to save; it remains available in memory.' };
  try {
    const key = lessonProgressStorageKey(bank.bank_id, bankVersion);
    target.setItem(key, serialized);
    if (target.getItem(key) !== serialized) throw Error('Storage did not preserve the saved value.');
    return { saved: true, message: '' };
  } catch {
    return { saved: false, message: 'Learn progress could not be saved; it remains available only until this page closes.' };
  }
}

/** Copy stable progress into a revised bank version while retaining every older record. */
function migratePreviousProgress(bank: DriveBank, bankVersion: string, storage: Storage, now: string): LessonProgressState | undefined {
  const prefix = `${LESSON_PROGRESS_PREFIX}:${encodeURIComponent(bank.bank_id)}:`;
  const currentKey = lessonProgressStorageKey(bank.bank_id, bankVersion);
  const candidates: Array<{ key: string; version: string; updatedAt: string }> = [];
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith(prefix) || key === currentKey) continue;
      const raw = storage.getItem(key);
      if (!raw || raw.length > MAX_RECORD_LENGTH) continue;
      const value: unknown = JSON.parse(raw);
      if (
        !record(value) ||
        value.schemaVersion !== LESSON_PROGRESS_SCHEMA ||
        value.bankId !== bank.bank_id ||
        typeof value.bankVersion !== 'string' ||
        value.bankVersion === bankVersion
      )
        continue;
      candidates.push({ key, version: value.bankVersion, updatedAt: timestamp(value.updatedAt) ? value.updatedAt : '' });
    }
  } catch {
    return undefined;
  }
  candidates.sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
  for (const candidate of candidates) {
    const currentVersionNumber = declaredVersionNumber(bank.version);
    const previousVersionNumber = declaredVersionNumber(candidate.version);
    if (currentVersionNumber === undefined || previousVersionNumber === undefined || currentVersionNumber <= previousVersionNumber)
      continue;
    const previous = readLessonProgress(bank, candidate.version, storage, now);
    if (previous.persistenceBlocked || (!Object.keys(previous.progressById).length && !previous.lessonPanelEvents.length)) continue;
    const migrated: LessonProgressState = { ...previous, bankVersion, found: true };
    const result = saveLessonProgress(bank, bankVersion, migrated, storage);
    if (result.saved) return migrated;
  }
  return undefined;
}

export {
  readLessonExportData,
  lessonExportDataFromState,
  type LessonProgressExport,
  type LessonExportData,
} from './lesson-progress-export';
