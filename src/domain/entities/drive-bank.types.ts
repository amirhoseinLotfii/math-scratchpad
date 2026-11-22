import type { Lesson, QuestionLessonFields } from './lesson.types';

export type AnswerType = 'math' | 'text' | 'choice' | 'true_false_why' | 'find_mistake';

export type BankQuestion = {
  id: string;
  mode: 'math' | 'text';
  source: string;
  prompt?: string;
  /** Optional (bank 1.0 backward-compatible extension): hint-only guidance, never a solution. */
  guidance?: string;
  answerType?: AnswerType;
  choices?: string[];
} & QuestionLessonFields;

export type DriveBankChapter = {
  id: string;
  number: number;
  title: string;
  source: string;
  pdfPages: string;
  lessonIds: string[];
};

export type DriveBank = {
  schema_version: string;
  bank_id: string;
  version: string;
  questions: BankQuestion[];
  lessons?: Lesson[];
  chapter?: DriveBankChapter;
  parseWarnings?: string[];
};

export type CachedBank = {
  fileId: string;
  bank: DriveBank;
  version: string;
  fingerprint: string;
  savedAt: string;
};

export type ArchivedSession = { id: string; savedAt: string; data: string };

export type DriveMeta = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  md5Checksum?: string;
  modifiedTime?: string;
  headRevisionId?: string;
  version?: string;
  trashed?: boolean;
};
