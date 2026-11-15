import type { BankQuestion, DriveBank } from '../drive-bank/drive-bank';
import { type Lesson, type LessonProgress } from './types';
import { type LessonSection } from './lesson-sections';
import { ActivityTracker } from '../../sync/activity-tracker';
import { type LearnEventContext } from '../../sync/events';

/**
 * Where the learner stopped, handed over only when they ask to continue.
 * Restoration scrolls the lesson pane; it never focuses an editor or opens the keyboard.
 */
export type LessonRestoreTarget = {
  sectionId?: string;
  contentAnchorId?: string;
  scrollOffset?: number;
};

export type LessonScreenProps = {
  bank: DriveBank | null;
  lesson: Lesson | null;
  loading?: boolean;
  initialProgress?: LessonProgress;
  restore?: LessonRestoreTarget;
  onBack: () => void;
  onProgress?: (progress: LessonProgress) => void;
  onStartPractice: (lesson: Lesson, progress: LessonProgress, questions: BankQuestion[], sectionId?: string) => void;
  practiceError?: string;
  progressMessage?: string;
  activityTracker?: ActivityTracker;
  eventContext?: LearnEventContext;
};

export type ReadyLessonProps = LessonScreenProps & { bank: DriveBank; lesson: Lesson };

export type LessonEventContextFor = (question?: BankQuestion, section?: LessonSection, conceptId?: string) => LearnEventContext;
export type LessonProgressWriter = (next: LessonProgress) => void;
