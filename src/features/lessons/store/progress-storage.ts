import type { DriveBank } from '../../../domain/entities/drive-bank.types';
import { dualWriteToDexie } from '../../../storage/dual-write-bridge';
import type { LessonProgress } from '../types';
import { migratePreviousProgress } from './progress-migration';
import { normalizeProgress, validActivePanel, validPanelEvent } from './progress-normalizer';
import {
  availableStorage,
  emptyLessonProgressState,
  isRecord,
  LESSON_PROGRESS_SCHEMA,
  lessonProgressStorageKey,
  MAX_RECORD_LENGTH,
  nowTimestamp,
  type LessonProgressState,
} from './progress-types';

function sameProgressPayload(existing: string | null, payload: { updatedAt: string }): boolean {
  if (!existing) return false;
  try {
    const parsed = JSON.parse(existing) as Record<string, unknown>;
    if (!isRecord(parsed)) return false;
    const { updatedAt: _previous, ...rest } = parsed;
    const { updatedAt: _next, ...next } = payload;
    return JSON.stringify(rest) === JSON.stringify(next);
  } catch { return false; }
}

export function readLessonProgress(bank: DriveBank, bankVersion: string, storage?: Storage, now = nowTimestamp()): LessonProgressState {
  const state = emptyLessonProgressState(bank.bank_id, bankVersion);
  const target = availableStorage(storage);
  if (!target) return { ...state, persistenceBlocked: true, warning: 'Learn progress storage is unavailable. Progress will remain in memory until this page closes.' };
  let raw: string | null;
  try { raw = target.getItem(lessonProgressStorageKey(bank.bank_id, bankVersion)); }
  catch { return { ...state, persistenceBlocked: true, warning: 'Learn progress could not be read. Existing data was left untouched; new progress will remain in memory.' }; }
  if (raw === null) {
    return migratePreviousProgress(bank, bankVersion, target, now, { read: readLessonProgress, save: saveLessonProgress }) ?? state;
  }
  state.found = true;
  if (raw.length > MAX_RECORD_LENGTH) return { ...state, persistenceBlocked: true, warning: 'Saved Learn progress is too large to validate. It was left untouched; this lesson starts fresh in memory.' };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return { ...state, persistenceBlocked: true, warning: 'Saved Learn progress is invalid. It was left untouched; this lesson starts fresh in memory.' }; }
  if (!isRecord(parsed) || parsed.schemaVersion !== LESSON_PROGRESS_SCHEMA || parsed.bankId !== bank.bank_id || parsed.bankVersion !== bankVersion || !isRecord(parsed.lessons) || !Array.isArray(parsed.lessonPanelEvents)) {
    return { ...state, persistenceBlocked: true, warning: 'Saved Learn progress belongs to another bank version or format. It was left untouched; this lesson starts fresh in memory.' };
  }
  const lessons = new Map((bank.lessons ?? []).map(lesson => [lesson.id, lesson]));
  const questions = new Map(bank.questions.map(question => [question.id, question]));
  let degraded = false;
  for (const [lessonId, rawProgress] of Object.entries(parsed.lessons)) {
    const lesson = lessons.get(lessonId);
    if (!lesson) { degraded = true; continue; }
    const progress = normalizeProgress(rawProgress, lesson, questions);
    if (progress) state.progressById[lessonId] = progress;
    else degraded = true;
  }
  state.lessonPanelEvents = parsed.lessonPanelEvents.filter(event => validPanelEvent(event, bank));
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

export function saveLessonProgress(bank: DriveBank, bankVersion: string, state: LessonProgressState, storage?: Storage): { saved: boolean; message: string } {
  if (state.persistenceBlocked) return { saved: false, message: state.warning || 'Saved Learn progress is protected and was not overwritten.' };
  const target = availableStorage(storage);
  if (!target) return { saved: false, message: 'Learn progress could not be saved; it remains available only until this page closes.' };
  const lessons: Record<string, LessonProgress> = {};
  const lessonById = new Map((bank.lessons ?? []).map(lesson => [lesson.id, lesson]));
  const questionById = new Map(bank.questions.map(question => [question.id, question]));
  for (const [lessonId, progress] of Object.entries(state.progressById)) {
    const lesson = lessonById.get(lessonId);
    const normalized = lesson && normalizeProgress(progress, lesson, questionById);
    if (!normalized) return { saved: false, message: 'Learn progress could not be validated and was not written.' };
    lessons[lessonId] = normalized;
  }
  const events = state.lessonPanelEvents.filter(event => validPanelEvent(event, bank));
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
  if (serialized.length > MAX_RECORD_LENGTH) return { saved: false, message: 'Learn progress is too large to save; it remains available in memory.' };
  try {
    const key = lessonProgressStorageKey(bank.bank_id, bankVersion);
    // Skip no-op saves: rewriting identical progress with only a fresh updatedAt
    // makes two open tabs echo the same record back and forth forever.
    if (sameProgressPayload(target.getItem(key), payload)) return { saved: true, message: '' };
    target.setItem(key, serialized);
    dualWriteToDexie(key, serialized).catch(() => {});
    if (target.getItem(key) !== serialized) throw Error('Storage did not preserve the saved value.');
    return { saved: true, message: '' };
  } catch {
    return { saved: false, message: 'Learn progress could not be saved; it remains available only until this page closes.' };
  }
}
