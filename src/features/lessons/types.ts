import { stepIsBlank, type Step, type TrueFalseChoice } from '../math-editor/model/model';
import type { LessonStatus } from '../../domain/entities/lesson.types';

export type {
  BlockType,
  Concept,
  DefinitionBlock,
  Difficulty,
  ExampleBlock,
  ImageBlock,
  ImageDescriptionBlock,
  Lang,
  Lesson,
  LessonBlock,
  LessonSectionDefinition,
  LessonStatus,
  MathBlock,
  QuestionLessonFields,
  Stage,
  TextBlock,
  UnsupportedBlock,
} from '../../domain/entities/lesson.types';

export type LessonCheckAnswer =
  | { type: 'text' | 'choice'; value: string }
  | { type: 'find_mistake'; value: string }
  | { type: 'true_false_why'; choice?: TrueFalseChoice; reason: string }
  | { type: 'math'; steps: Step[] };
/** Learn-only work-pane answer. Legacy math work remains attached when an old question used the wrong editor. */
export type LessonWorkAnswer = LessonCheckAnswer & { legacyMathSteps?: Step[] };
export function lessonCheckAnswerComplete(answer: LessonCheckAnswer | undefined): boolean {
  if (!answer) return false;
  if (answer.type === 'math') return answer.steps.some(step => !stepIsBlank(step) && (!step.isPrefilledFromQuestion || step.edited || step.final || answer.steps.length > 1));
  if (answer.type === 'true_false_why') return !!answer.choice && !!answer.reason.trim();
  return !!answer.value.trim();
}
export interface LessonProgress {
  lessonId: string;
  status: LessonStatus;
  currentConceptIndex: number;
  currentSectionIndex?: number;
  completedSectionIds?: string[];
  activePracticeSectionId?: string;
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
  revealedSteps: Record<string, number>;
  /** Learn-only scratch work from the lesson work pane, keyed `ex:<concept>:<block>` or `q:<questionId>`; never exported or graded. */
  workAnswers?: Record<string, LessonWorkAnswer>;
}
