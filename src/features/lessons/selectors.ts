import type { BankQuestion, DriveBank } from '../drive-bank/drive-bank';
import type { Concept, Lesson, Stage } from './types';
import type { LessonSection } from './lesson-sections';

export function getLesson(bank: Pick<DriveBank, 'lessons'>, lessonId: string | undefined): Lesson | undefined {
  return lessonId ? bank.lessons?.find(lesson => lesson.id === lessonId) : undefined;
}

export function getQuestionStage(question: Pick<BankQuestion, 'stage'>): Stage {
  return question.stage ?? 'practice';
}

function getConcept(bank: Pick<DriveBank, 'lessons'>, conceptId: string): Concept | undefined {
  for (const lesson of bank.lessons ?? []) {
    const concept = lesson.concepts.find(candidate => candidate.id === conceptId);
    if (concept) return concept;
  }
  return undefined;
}

export function getLearnChecks(bank: Pick<DriveBank, 'questions' | 'lessons'>, conceptId: string): BankQuestion[] {
  const concept = getConcept(bank, conceptId);
  if (!concept) return [];
  const questionsById = new Map(bank.questions.map(question => [question.id, question]));
  return concept.checkQuestionIds
    .map(questionId => questionsById.get(questionId))
    .filter((question): question is BankQuestion => !!question && getQuestionStage(question) === 'learn' && question.conceptId === conceptId);
}

export function getPracticeQuestions(bank: Pick<DriveBank, 'questions'>, lessonId: string): BankQuestion[] {
  return bank.questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => question.lessonId === lessonId && getQuestionStage(question) === 'practice')
    .sort((a, b) => comparePracticeOrder(a.question, b.question, lessonId)
      || a.index - b.index)
    .map(({ question }) => question);
}

export function getPracticeQuestionOrigin(question: BankQuestion, _lessonId?: string): 'textbook' | 'generated' | 'unspecified' {
  if (question.origin) return question.origin;
  // Legacy ID heuristics for banks that omit `origin`. Apply to the current lesson's
  // questions, not a hard-coded lesson id such as PC-1.1.
  if (/-X\d+$/.test(question.id)) return 'textbook';
  if (/-\d{2}$/.test(question.id)) return 'generated';
  return 'unspecified';
}

function originRank(question: BankQuestion, lessonId: string): number {
  const origin = getPracticeQuestionOrigin(question, lessonId);
  return origin === 'textbook' ? 0 : origin === 'generated' ? 2 : 1;
}

function textbookQuestionNumber(question: BankQuestion, lessonId: string): number | undefined {
  if (getPracticeQuestionOrigin(question, lessonId) !== 'textbook') return undefined;
  const match = question.id.match(/-X(\d+)$/);
  return match ? Number(match[1]) : undefined;
}

function comparePracticeOrder(a: BankQuestion, b: BankQuestion, lessonId: string): number {
  const rankDifference = originRank(a, lessonId) - originRank(b, lessonId);
  if (rankDifference) return rankDifference;
  const aNumber = textbookQuestionNumber(a, lessonId), bNumber = textbookQuestionNumber(b, lessonId);
  if (aNumber !== undefined && bNumber !== undefined && aNumber !== bNumber) return aNumber - bNumber;
  return (a.difficulty ?? Number.POSITIVE_INFINITY) - (b.difficulty ?? Number.POSITIVE_INFINITY);
}

/** OpenStax Precalculus §1.1 textbook exercise numbers → concept suffix (C02, …). */
function textbookConceptSuffix(questionNumber: number): string | undefined {
  if (questionNumber === 1 || (questionNumber >= 6 && questionNumber <= 26) || (questionNumber >= 60 && questionNumber <= 62)) return 'C02';
  if (questionNumber === 2) return 'C05';
  if (questionNumber === 3) return 'C11';
  if (questionNumber === 4 || questionNumber === 92) return 'C10';
  if (questionNumber === 5) return 'C12';
  if (questionNumber >= 27 && questionNumber <= 38) return 'C06';
  if (questionNumber >= 68 && questionNumber <= 75) return 'C13';
  if (questionNumber === 39 || (questionNumber >= 88 && questionNumber <= 91)) return 'C03';
  if (questionNumber >= 63 && questionNumber <= 65) return 'C04';
  if (questionNumber === 66 || questionNumber === 67) return 'C08';
  return undefined;
}

/**
 * Legacy fallback when a textbook practice item omits `conceptId`.
 * Builds `${lessonId}-${suffix}` for the *current* lesson and only returns it when
 * that concept actually exists on the lesson (when conceptIds are provided).
 */
function legacyTextbookConcept(
  question: BankQuestion,
  lessonId: string,
  conceptIds?: ReadonlySet<string> | readonly string[],
): string | undefined {
  const match = question.id.match(/-X(\d+)$/);
  if (!match) return undefined;
  const suffix = textbookConceptSuffix(Number(match[1]));
  if (!suffix) return undefined;
  const conceptId = `${lessonId}-${suffix}`;
  if (conceptIds) {
    const available = conceptIds instanceof Set ? conceptIds : new Set(conceptIds);
    if (!available.has(conceptId)) return undefined;
  }
  return conceptId;
}

export function getPracticeQuestionConceptId(
  question: BankQuestion,
  lessonId: string,
  conceptIds?: readonly string[],
): string | undefined {
  return question.conceptId ?? legacyTextbookConcept(question, lessonId, conceptIds);
}

export function getSectionLearnChecks(
  bank: Pick<DriveBank, 'questions' | 'lessons'>,
  lesson: Lesson,
  sections: LessonSection[],
  sectionIndex: number,
): BankQuestion[] {
  const section = sections[sectionIndex];
  if (!section) return [];
  const explicitSection = lesson.sections?.find(item => item.id === section.id);
  if (explicitSection) {
    const questionsById = new Map(bank.questions.map(question => [question.id, question]));
    return explicitSection.learnQuestionIds
      .map(questionId => questionsById.get(questionId))
      .filter((question): question is BankQuestion => !!question && getQuestionStage(question) === 'learn' && question.lessonId === lesson.id)
      .sort((a, b) => bank.questions.indexOf(a) - bank.questions.indexOf(b));
  }
  const result: BankQuestion[] = [];
  for (const { concept } of section.concepts) {
    const appearances = sections.flatMap((item, index) => item.concepts.some(entry => entry.concept.id === concept.id) ? [index] : []);
    const position = appearances.indexOf(sectionIndex);
    if (position < 0) continue;
    const checks = getLearnChecks(bank, concept.id);
    const assigned = checks.filter((_, checkIndex) => Math.floor(checkIndex * appearances.length / Math.max(checks.length, 1)) === position);
    result.push(...assigned);
  }
  return result;
}

/** Practice attached to this two-page section; source exercises always precede custom practice. */
export function getSectionPracticeQuestions(
  bank: Pick<DriveBank, 'questions'>,
  lesson: Lesson,
  sections: LessonSection[],
  sectionIndex: number,
): BankQuestion[] {
  const section = sections[sectionIndex];
  if (!section) return [];
  const explicitSection = lesson.sections?.find(item => item.id === section.id);
  if (explicitSection) {
    const questionsById = new Map(bank.questions.map(question => [question.id, question]));
    return explicitSection.practiceQuestionIds
      .map(questionId => questionsById.get(questionId))
      .filter((question): question is BankQuestion => !!question && question.lessonId === lesson.id && getQuestionStage(question) === 'practice')
      .sort((a, b) => comparePracticeOrder(a, b, lesson.id) || bank.questions.indexOf(a) - bank.questions.indexOf(b));
  }
  const lessonQuestions = bank.questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => question.lessonId === lesson.id && getQuestionStage(question) === 'practice');
  const explicit = lessonQuestions.filter(({ question }) => question.sectionId === section.id);
  const assigned = new Map<number, BankQuestion>();
  const byConceptAndOrigin = new Map<string, { conceptId: string; items: Array<{ question: BankQuestion; index: number }> }>();

  for (const item of lessonQuestions) {
    if (item.question.sectionId) continue;
    const conceptId = getPracticeQuestionConceptId(item.question, lesson.id, lesson.concepts.map(concept => concept.id));
    if (!conceptId) continue;
    const key = `${conceptId}:${getPracticeQuestionOrigin(item.question, lesson.id)}`;
    const group = byConceptAndOrigin.get(key) ?? { conceptId, items: [] };
    group.items.push(item);
    byConceptAndOrigin.set(key, group);
  }

  for (const { conceptId, items } of byConceptAndOrigin.values()) {
    items.sort((a, b) => comparePracticeOrder(a.question, b.question, lesson.id)
      || a.index - b.index);
    const appearances = sections.flatMap((item, index) => item.concepts.some(entry => entry.concept.id === conceptId) ? [index] : []);
    if (!appearances.length) continue;
    for (const [position, item] of items.entries()) {
      const unit = appearances[Math.min(appearances.length - 1, Math.floor(position * appearances.length / items.length))];
      if (unit === sectionIndex) assigned.set(item.index, item.question);
    }
  }

  const selected = [...explicit, ...[...assigned].map(([index, question]) => ({ question, index }))];
  return selected
    .sort((a, b) => comparePracticeOrder(a.question, b.question, lesson.id)
      || a.index - b.index)
    .map(({ question }) => question);
}
