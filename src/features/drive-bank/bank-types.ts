import { type AnswerType } from '../../model';
import type { Lesson, QuestionLessonFields } from '../lessons/types';

export type BankQuestion = {
  id: string;
  mode: 'math' | 'text';
  source: string;
  prompt?: string;
  /** Optional (bank 1.0 backward-compatible extension): hint-only guidance, never a solution. */ guidance?: string;
  answerType?: AnswerType;
  choices?: string[];
} & QuestionLessonFields;
export type BankChapter = { id: string; number: number; title: string; source: string; pdfPages: string; lessonIds: string[] };
export type DriveBank = {
  schema_version: string;
  bank_id: string;
  version: string;
  questions: BankQuestion[];
  lessons?: Lesson[];
  chapter?: BankChapter;
  parseWarnings?: string[];
};
