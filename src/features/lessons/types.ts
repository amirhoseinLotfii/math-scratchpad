import type { Step } from '../../model';

export type Lang = 'fa' | 'en';
export type BlockType = 'heading' | 'paragraph' | 'definition' | 'example' | 'note' | 'math' | 'image';

interface BlockBase { type: BlockType; lang?: Lang }
export interface TextBlock extends BlockBase { type: 'heading' | 'paragraph' | 'note'; text: string }
export interface DefinitionBlock extends BlockBase { type: 'definition'; text: string; latex?: string }
export interface ExampleBlock extends BlockBase { type: 'example'; title?: string; text?: string; latex?: string; steps: string[] }
export interface MathBlock extends BlockBase { type: 'math'; latex: string }
export interface ImageBlock extends BlockBase { type: 'image'; src: string; alt: string }
export interface UnsupportedBlock { type: 'unsupported'; originalType: string }
export type LessonBlock = TextBlock | DefinitionBlock | ExampleBlock | MathBlock | ImageBlock | UnsupportedBlock;

export interface Concept { id: string; title: string; pages?: string; blocks: LessonBlock[]; checkQuestionIds: string[] }
export interface Lesson { id: string; book: string; section: string; title: string; pages?: string; concepts: Concept[] }

export type Stage = 'learn' | 'practice';
export type Difficulty = 1 | 2 | 3;
export interface QuestionLessonFields {
  lessonId?: string;
  conceptId?: string;
  stage?: Stage;
  difficulty?: Difficulty;
}

export type LessonStatus = 'not_started' | 'learning' | 'practising' | 'done';
export type LessonCheckAnswer =
  | { type: 'text' | 'choice'; value: string }
  | { type: 'math'; steps: Step[] };
export interface LessonProgress {
  lessonId: string;
  status: LessonStatus;
  currentConceptIndex: number;
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
  revealedSteps: Record<string, number>;
}
