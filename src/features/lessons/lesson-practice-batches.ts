import { MAX_SESSION_EXERCISES } from '../../model';
import type { BankQuestion } from '../drive-bank/drive-bank';

/** Keeps textbook exercises in bank order while splitting large concepts into editor-sized batches. */
export function nextTextbookPracticeBatch(questions: BankQuestion[], completedIds: string[] = []): BankQuestion[] {
  const completed = new Set(completedIds);
  return questions.filter(question => !completed.has(question.id)).slice(0, MAX_SESSION_EXERCISES);
}
