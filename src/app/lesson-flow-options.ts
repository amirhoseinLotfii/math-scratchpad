import { type BankQuestion, type DriveBank } from '../features/drive-bank/drive-bank';
import type { LessonProgress } from '../features/lessons/types';
import { ActivityTracker } from '../sync/activity-tracker';
import { useBankSession } from './use-bank-session';

import type { AppDispatch, ScratchStore } from '../store';
import type { RefObject, Dispatch, SetStateAction } from 'react';
type LoadedBank = { bank: DriveBank; version: string };
type BankSession = ReturnType<typeof useBankSession>;
type Set<T> = Dispatch<SetStateAction<T>>;
export type LessonFlowOptions = {
  store: ScratchStore;
  dispatch: AppDispatch;
  bankSession: BankSession;
  matchingBank: LoadedBank | null;
  currentBankQuestion?: BankQuestion;
  sessionId: string;
  activityTracker: ActivityTracker;
  exam: boolean;
  menuInvoker: RefObject<HTMLButtonElement | null>;
  setActiveInspector: Set<'drive' | 'sync' | null>;
  setDriveBankInitialized: Set<boolean>;
  setShowResults: Set<boolean>;
  setManual: Set<string>;
  setComplete: Set<boolean>;
  switchQuestion: (id: string) => void;
};
export function freshLessonProgress(lessonId: string): LessonProgress {
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
