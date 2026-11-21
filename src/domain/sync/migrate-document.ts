import { BankChapter, BankChapterSchema } from '../entities/bank-chapter.types';
import { ChapterBundle, ChapterBundleSchema } from '../entities/chapter-bundle.types';
import {
  ChapterProgress,
  ChapterProgressSchema,
  ItemProgress,
  StepRecord
} from '../entities/chapter-progress.types';
import { HistoryChunk, HistoryChunkSchema } from '../entities/history-chunk.types';
import { TimerLog, TimerLogSchema } from '../entities/timer-log.types';
import { formatHlc } from './hlc';

export interface MigrationResult {
  kind: 'chapter_progress' | 'bank_chapter' | 'history_chunk' | 'timer_log' | 'chapter_bundle' | 'unknown';
  document?: ChapterProgress | BankChapter | HistoryChunk | TimerLog | ChapterBundle;
  multipleProgress?: ChapterProgress[];
  rawPreserved?: Record<string, unknown>;
}

function safeHlc(tsMs: number, counter: number, deviceId: string): string {
  return formatHlc(tsMs, counter, deviceId);
}

/**
 * Normalizes an orderKey for index i in an array.
 */
function defaultOrderKey(index: number): string {
  return `a${index}`;
}

/**
 * Converts a legacy step into a canonical StepRecord.
 */
function migrateStep(
  rawStep: any,
  index: number,
  baseHlc: string
): StepRecord {
  const stepId = String(rawStep.id || rawStep.stepId || `step-${index}`);
  const orderKey = String(rawStep.orderKey || defaultOrderKey(index));
  const branchId = String(rawStep.branchId || 'main');
  const parentStepId = rawStep.parentStepId ? String(rawStep.parentStepId) : undefined;
  const branchSign = rawStep.branchSign || undefined;
  const updatedHlc = rawStep.updatedHlc || baseHlc;
  const deleted = Boolean(rawStep.deleted);
  const isPrefilledFromQuestion = Boolean(rawStep.isPrefilledFromQuestion);

  let segments: any[] = [];
  if (Array.isArray(rawStep.segments) && rawStep.segments.length > 0) {
    segments = rawStep.segments.map((seg: any) => ({
      type: seg.type || 'math',
      content: String(seg.content || '')
    }));
  } else if (typeof rawStep.mathLatex === 'string') {
    // Check if it was a Persian text stored in mathLatex
    const content = rawStep.mathLatex;
    const isPersianOnly = /[\u0600-\u06FF]/.test(content) && !/[\\{}^_]/.test(content);
    segments = [
      {
        type: isPersianOnly ? 'persian_text' : 'math',
        content
      }
    ];
  } else if (rawStep.expression) {
    segments = [
      {
        type: 'math',
        content: String(rawStep.source || '')
      }
    ];
  } else {
    segments = [{ type: 'math', content: '' }];
  }

  return {
    stepId,
    orderKey,
    branchId,
    parentStepId,
    branchSign,
    updatedHlc,
    deleted,
    segments,
    combinedLatex: rawStep.combinedLatex || rawStep.mathLatex,
    isPrefilledFromQuestion
  };
}

/**
 * Migrates any raw document, server-state, or legacy JSON into canonical Draft 2020-12 entities.
 */
export function migrateDocument(
  raw: unknown,
  defaultDeviceId: string = 'device-migrator'
): MigrationResult {
  if (!raw || typeof raw !== 'object') {
    return { kind: 'unknown' };
  }

  const data = raw as Record<string, any>;
  const now = Date.now();
  const fallbackHlc = safeHlc(now, 0, defaultDeviceId);

  // 1. Direct Canonical Checks
  if (data.kind === 'bank_chapter') {
    const parsed = BankChapterSchema.safeParse(data);
    if (parsed.success) return { kind: 'bank_chapter', document: parsed.data };
  }
  if (data.kind === 'chapter_progress') {
    const parsed = ChapterProgressSchema.safeParse(data);
    if (parsed.success) return { kind: 'chapter_progress', document: parsed.data };
  }
  if (data.kind === 'history_chunk') {
    const parsed = HistoryChunkSchema.safeParse(data);
    if (parsed.success) return { kind: 'history_chunk', document: parsed.data };
  }
  if (data.kind === 'timer_log') {
    const parsed = TimerLogSchema.safeParse(data);
    if (parsed.success) return { kind: 'timer_log', document: parsed.data };
  }
  if (data.kind === 'chapter_bundle') {
    const parsed = ChapterBundleSchema.safeParse(data);
    if (parsed.success) return { kind: 'chapter_bundle', document: parsed.data };
  }

  // 2. Legacy server-state format: math-scratchpad-server-state/v1
  if (data.format === 'math-scratchpad-server-state/v1' && Array.isArray(data.records)) {
    const progressList: ChapterProgress[] = [];
    const rawPreserved: Record<string, unknown> = {};

    for (const record of data.records) {
      if (!record || typeof record.value !== 'string') continue;
      try {
        const val = JSON.parse(record.value);
        if (record.key?.startsWith('math-scratchpad-lesson-progress-v1:')) {
          const res = migrateDocument(val, defaultDeviceId);
          if (res.document && res.kind === 'chapter_progress') {
            progressList.push(res.document as ChapterProgress);
          } else if (res.multipleProgress) {
            progressList.push(...res.multipleProgress);
          }
        } else if (record.key === 'math-scratchpad-session-v3' || record.key === 'math-scratchpad-redux-v2') {
          const res = migrateDocument(val, defaultDeviceId);
          if (res.document && res.kind === 'chapter_progress') {
            progressList.push(res.document as ChapterProgress);
          }
        } else {
          rawPreserved[record.key] = val;
        }
      } catch {
        rawPreserved[record.key || 'unparsed'] = record.value;
      }
    }

    if (progressList.length > 0) {
      return {
        kind: 'chapter_progress',
        document: progressList[0],
        multipleProgress: progressList,
        rawPreserved
      };
    }
  }

  // 3. Legacy lesson progress: math-scratchpad-lesson-progress-v1 format
  if (data.lessons && typeof data.lessons === 'object') {
    const bankId = String(data.bankId || 'default-bank');
    const bankVersion = String(data.bankVersion || 'v1');
    const progressList: ChapterProgress[] = [];

    for (const [lessonId, lessonVal] of Object.entries<any>(data.lessons)) {
      if (!lessonVal || typeof lessonVal !== 'object') continue;
      const items: Record<string, ItemProgress> = {};

      const workAnswers = lessonVal.workAnswers || {};
      const checkAnswers = lessonVal.checkAnswers || {};
      const allItemKeys = Array.from(new Set([...Object.keys(workAnswers), ...Object.keys(checkAnswers)]));

      for (const itemId of allItemKeys) {
        const work = workAnswers[itemId];
        const check = checkAnswers[itemId];
        const answerSource = work || check || {};

        const steps: Record<string, StepRecord> = {};
        if (Array.isArray(answerSource.steps)) {
          answerSource.steps.forEach((st: any, idx: number) => {
            const stepRec = migrateStep(st, idx, fallbackHlc);
            steps[stepRec.stepId] = stepRec;
          });
        }

        const isSolved = lessonVal.completedSectionIds?.includes(itemId) || Boolean(answerSource.finalSubmittedAt);
        items[itemId] = {
          status: isSolved ? 'solved' : (Object.keys(steps).length > 0 ? 'in_progress' : 'not_started'),
          statusHlc: fallbackHlc,
          attemptCount: Number(answerSource.attemptCount || (isSolved ? 1 : 0)),
          steps,
          finalAnswer: answerSource.finalAnswer,
          finalSubmittedAt: answerSource.finalSubmittedAt,
          finalSubmitHlc: isSolved ? fallbackHlc : undefined,
          editedAfterSubmit: Boolean(answerSource.editedAfterSubmit)
        };
      }

      const chapterProg: ChapterProgress = {
        schemaVersion: '1.0.0',
        kind: 'chapter_progress',
        chapterId: String(lessonVal.lessonId || lessonId),
        bankVersion,
        updatedHlc: fallbackHlc,
        items,
        resumeState: {
          lastVisitedItemId: lessonVal.currentConceptIndex ? `concept-${lessonVal.currentConceptIndex}` : undefined
        }
      };
      progressList.push(chapterProg);
    }

    if (progressList.length > 0) {
      return {
        kind: 'chapter_progress',
        document: progressList[0],
        multipleProgress: progressList
      };
    }
  }

  // 4. Legacy session-v3 / PersistedSession format
  if (data.doc && Array.isArray(data.doc.exercises)) {
    const chapterId = String(data.doc.session?.bankId || 'session-chapter');
    const bankVersion = String(data.doc.session?.bankVersion || 'v1');
    const items: Record<string, ItemProgress> = {};

    data.doc.exercises.forEach((ex: any, exIdx: number) => {
      const itemId = String(ex.bankQuestionId || ex.id || `item-${exIdx}`);
      const steps: Record<string, StepRecord> = {};

      if (Array.isArray(ex.steps)) {
        ex.steps.forEach((st: any, sIdx: number) => {
          const stepRec = migrateStep(st, sIdx, fallbackHlc);
          steps[stepRec.stepId] = stepRec;
        });
      }

      // Preserve solved ONLY if submittedAt + confidence exists per §3.2
      const isSolved = Boolean(ex.submittedAt && ex.confidence);

      items[itemId] = {
        status: isSolved ? 'solved' : (Object.keys(steps).length > 0 ? 'in_progress' : 'not_started'),
        statusHlc: fallbackHlc,
        attemptCount: isSolved ? 1 : 0,
        steps,
        finalAnswer: ex.answerText ? { text: ex.answerText, choice: ex.answerChoice } : undefined,
        finalSubmittedAt: ex.submittedAt,
        finalSubmitHlc: isSolved ? fallbackHlc : undefined,
        editedAfterSubmit: false
      };
    });

    const chapterProg: ChapterProgress = {
      schemaVersion: '1.0.0',
      kind: 'chapter_progress',
      chapterId,
      bankVersion,
      updatedHlc: fallbackHlc,
      items,
      resumeState: {
        lastVisitedItemId: data.doc.exerciseId
      }
    };

    return {
      kind: 'chapter_progress',
      document: chapterProg
    };
  }

  return { kind: 'unknown', rawPreserved: data };
}
