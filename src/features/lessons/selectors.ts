import type { BankQuestion, DriveBank } from '../drive-bank/drive-bank';
import type { Concept, Lesson, Stage } from './types';

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
    .sort((a, b) => (a.question.difficulty ?? Number.POSITIVE_INFINITY) - (b.question.difficulty ?? Number.POSITIVE_INFINITY) || a.index - b.index)
    .map(({ question }) => question);
}
