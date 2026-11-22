import type { BankQuestion, DriveBank } from '../../../domain/entities/drive-bank.types';
import type { LearnEventContext } from '../../../sync/events';
import { stepLatex } from '../../math-editor/model/model';
import { localizeLessonDigits } from '../lesson-content';
import type { LessonSection } from '../lesson-sections';
import type { Lesson, LessonCheckAnswer, LessonProgress, LessonWorkAnswer } from '../types';

/**
 * Where the learner stopped, handed over only when they ask to continue.
 * Restoration scrolls the lesson pane; it never focuses an editor or opens the keyboard.
 */
export type LessonRestoreTarget = {
  sectionId?: string;
  contentAnchorId?: string;
  scrollOffset?: number;
};

export function newProgress(lessonId: string): LessonProgress {
  return {
    lessonId,
    status: 'learning',
    currentConceptIndex: 0,
    currentSectionIndex: 0,
    completedConceptIds: [],
    completedSectionIds: [],
    answeredCheckIds: [],
    skippedChecks: [],
    summaryOpen: false,
    revealedSteps: {},
    learnStartedAt: new Date().toISOString(),
  };
}

export function resolveInitialSectionIndex(
  lesson: Lesson,
  sections: LessonSection[],
  initialProgress?: LessonProgress,
  restore?: LessonRestoreTarget,
): number {
  if (restore?.sectionId) {
    const restored = sections.findIndex(section => section.id === restore.sectionId);
    if (restored >= 0) return restored;
  }
  const saved = initialProgress?.currentSectionIndex;
  if (Number.isInteger(saved) && saved! >= 0 && saved! < sections.length) return saved!;
  const conceptId = lesson.concepts[initialProgress?.currentConceptIndex ?? 0]?.id;
  const found = sections.findIndex(section => section.concepts.some(entry => entry.concept.id === conceptId));
  return Math.max(0, found);
}

export function resolveInitialSummary(lesson: Lesson, initialProgress?: LessonProgress): boolean {
  return (
    initialProgress?.summaryOpen ??
    (lesson.concepts.length === 0 ||
      initialProgress?.status === 'done' ||
      (!!initialProgress?.learnDoneAt &&
        lesson.concepts.length > 0 &&
        lesson.concepts.every(concept => initialProgress.completedConceptIds.includes(concept.id))))
  );
}

export type LessonEventItemType = 'mcq' | 'true_false_why' | 'find_mistake' | 'typed' | 'step_by_step';

export function questionEventItemType(question: Pick<BankQuestion, 'answerType' | 'mode'>): LessonEventItemType {
  return question.answerType === 'choice'
    ? 'mcq'
    : question.answerType === 'true_false_why'
      ? 'true_false_why'
      : question.answerType === 'find_mistake'
        ? 'find_mistake'
        : question.answerType === 'text' || question.mode === 'text'
          ? 'typed'
          : 'step_by_step';
}

export function answerEventItemType(answer: LessonCheckAnswer): LessonEventItemType {
  return answer.type === 'math'
    ? 'step_by_step'
    : answer.type === 'choice'
      ? 'mcq'
      : answer.type === 'true_false_why'
        ? 'true_false_why'
        : answer.type === 'find_mistake'
          ? 'find_mistake'
          : 'typed';
}

export function formatWorkEventAnswer(answer: LessonWorkAnswer): string {
  if (answer.type === 'math') {
    return answer.steps.map(step => stepLatex(step).slice(0, 4_000)).slice(0, 40).join('\n').slice(0, 8_000);
  }
  if (answer.type === 'true_false_why') {
    return [answer.choice ? (answer.choice === 'true' ? 'True' : 'False') : '', answer.reason]
      .filter(Boolean)
      .join(' — ')
      .slice(0, 8_000);
  }
  return answer.value.slice(0, 8_000);
}

export function formatCheckAnswerText(value: LessonCheckAnswer | null): { answerText: string; steps?: string[] } {
  const steps = value?.type === 'math' ? value.steps.map(step => stepLatex(step).slice(0, 4_000)).slice(0, 40) : undefined;
  const answerText =
    value?.type === 'math'
      ? steps?.join('\n') ?? ''
      : value?.type === 'true_false_why'
        ? [value.choice ? (value.choice === 'true' ? 'True' : 'False') : '', value.reason].filter(Boolean).join(' — ')
        : value?.value ?? '';
  return { answerText, steps };
}

export function buildLessonEventContext(
  bank: DriveBank,
  lesson: Lesson,
  eventContext?: LearnEventContext,
): LearnEventContext {
  const sectionNumber = Number(lesson.section.match(/^\s*(\d+)/)?.[1]);
  return {
    ...eventContext,
    bankVersion: eventContext?.bankVersion ?? bank.version ?? 'unknown',
    session: eventContext?.session ?? 'unknown',
    chapter: eventContext?.chapter ?? bank.chapter?.number ?? (Number.isInteger(sectionNumber) ? sectionNumber : 0),
    lesson: lesson.id,
    section: 'unknown',
    concept: 'unknown',
  };
}

export function formatLessonPages(pages?: string): string {
  return pages ? pages.replace(/(\d)\s*-\s*(\d)/, '$1–$2') : '';
}

export function formatSectionPages(section?: LessonSection): string {
  if (!section?.startPage) return '';
  return section.startPage === section.endPage
    ? localizeLessonDigits(section.startPage)
    : `${localizeLessonDigits(section.startPage)}–${localizeLessonDigits(section.endPage ?? section.startPage + 1)}`;
}
