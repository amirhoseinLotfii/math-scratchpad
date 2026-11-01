import type { Step } from '../../model';

export type Lang = 'fa' | 'en';
export type BlockType = 'heading' | 'paragraph' | 'definition' | 'example' | 'note' | 'math' | 'image' | 'image-description';

interface BlockBase { type: BlockType; lang?: Lang; page?: number }
export interface TextBlock extends BlockBase { type: 'heading' | 'paragraph' | 'note'; text: string; latex?: string }
export interface DefinitionBlock extends BlockBase { type: 'definition'; text: string; latex?: string }
export interface ExampleBlock extends BlockBase { type: 'example'; title?: string; text?: string; latex?: string; steps: string[]; source?: 'book' | 'extra'; modeledOn?: string }
export interface MathBlock extends BlockBase { type: 'math'; latex: string; text?: string }
export interface ImageBlock extends BlockBase { type: 'image'; src: string; alt: string; caption?: string }
export interface ImageDescriptionBlock extends BlockBase { type: 'image-description'; text: string }
export interface UnsupportedBlock { type: 'unsupported'; originalType: string; source?: string }
export type LessonBlock = TextBlock | DefinitionBlock | ExampleBlock | MathBlock | ImageBlock | ImageDescriptionBlock | UnsupportedBlock;

export interface Concept { id: string; title: string; pages?: string; blocks: LessonBlock[]; checkQuestionIds: string[]; learningChunks?: LearningChunk[] }
/** An ordered reading chunk with one to three answerable, question-only checks. */
export interface LearningChunk {
  id: string;
  title?: string;
  pages?: string;
  /** Zero-based indexes into Concept.blocks; chunks partition the source in book order. */
  blockIndexes: number[];
  questionIds: string[];
}
/** A short, source-page-sized unit in a complete lesson/chapter bank. */
export interface LessonSectionDefinition {
  id: string;
  title: string;
  pages: string;
  conceptIds: string[];
  learnQuestionIds: string[];
  practiceQuestionIds: string[];
}
export interface Lesson { id: string; book: string; section: string; title: string; pages?: string; concepts: Concept[]; sections?: LessonSectionDefinition[] }

export type Stage = 'learn' | 'practice';
export type Difficulty = 1 | 2 | 3;
export interface QuestionLessonFields {
  lessonId?: string;
  conceptId?: string;
  stage?: Stage;
  difficulty?: Difficulty;
  origin?: 'textbook' | 'generated';
  sectionId?: string;
  tags?: { chapter?: string; lesson?: string; section?: string; concept?: string; skill?: string; source?: 'book' | 'extra'; modeledOn?: string };
  interactionType?: 'typed' | 'multiple-choice' | 'true-false-why' | 'find-mistake' | 'step-by-step' | 'explain';
  requiresExplanation?: boolean;
}

export type LessonStatus = 'not_started' | 'learning' | 'practising' | 'done';
export type LessonCheckAnswer =
  | { type: 'text'; value: string }
  | { type: 'choice'; value: string; explanation?: string }
  | { type: 'math'; steps: Step[] };
export type LessonChunkAnswer = { value: string; explanation?: string; updatedAt: string; submittedAt?: string };
export type LessonExampleAttempt = { attemptedAt: string; comparedAt?: string };
export type LessonPracticeResult = {
  status: 'not_started' | 'draft' | 'answered' | 'skipped';
  correctness?: 'correct' | 'incorrect' | 'unknown';
  answer?: string;
  steps: { latex: string; final: boolean }[];
  startedAt?: string;
  updatedAt: string;
  submittedAt?: string;
};
export type MixedReviewRun = {
  id: string;
  mode: 'lesson' | 'chapter';
  questionIds: string[];
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  results: Record<string, LessonPracticeResult>;
};
export interface LessonProgress {
  lessonId: string;
  status: LessonStatus;
  currentConceptIndex: number;
  currentSectionIndex?: number;
  completedSectionIds?: string[];
  activePracticeSectionId?: string;
  activePracticeConceptId?: string;
  /** Textbook-first question IDs completed across end-of-lesson practice batches. */
  completedPracticeQuestionIds?: string[];
  /** Question IDs in the currently active end-of-lesson batch (at most 100). */
  activePracticeQuestionIds?: string[];
  completedConceptIds: string[];
  answeredCheckIds: string[];
  /** Learn-only responses; kept in the namespaced Learn store, never in the practice session/export. */
  checkAnswers?: Record<string, LessonCheckAnswer>;
  skippedChecks: { questionId: string; at: string }[];
  confidenceByCheckId?: Record<string, 1 | 2 | 3 | 4 | 5>;
  learnSkipped?: { at: string };
  learnStartedAt?: string;
  learnDoneAt?: string;
  practiceStartedAt?: string;
  /** Whether the saved in-Learn view is the lesson summary rather than a concept. */
  summaryOpen?: boolean;
  /** Active v22 read/solve phase; absent in v21 progress. */
  currentChunkId?: string;
  completedLearningChunkIds?: string[];
  activeConceptPhase?: 'reading' | 'solving' | 'summary';
  conceptSummaryId?: string;
  chunkAnswers?: Record<string, LessonChunkAnswer>;
  exampleAttempts?: Record<string, LessonExampleAttempt>;
  /** Per-question snapshots from the existing practice editor, keyed by bank question ID. */
  practiceResults?: Record<string, LessonPracticeResult>;
  /** Mixed reviews are saved in the lesson that launched them, even when their questions come from earlier lessons. */
  mixedReviewRuns?: MixedReviewRun[];
  activeMixedReviewRunId?: string;
  revealedSteps: Record<string, number>;
  /** Learn-only scratch work from the lesson work pane, keyed `ex:<concept>:<block>` or `q:<questionId>`. */
  workAnswers?: Record<string, { type: 'math'; steps: Step[] }>;
}
