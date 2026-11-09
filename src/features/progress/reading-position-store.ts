import { create } from 'zustand';
import type { LearnEvent } from '../../sync/events';
import { getDeviceId, subscribeToLearnEvents } from '../../sync/events';
import { subscribeLearningStorage } from '../../sync/browser-db';
import {
  mergeLatestReadingPosition,
  readingPositionFromLearnEvent,
} from './reading-position-from-event';
import {
  clearReadingPositionFromLearningStorage,
  readReadingPositionFromLearningStorage,
  READING_POSITION_STORAGE_KEY,
  writeReadingPositionToLearningStorage,
} from './reading-position-storage';
import { ReadingPosition, MinimalReadingPosition, DEFAULT_POSITION_CONFIG } from './reading-position-types';

type ReadingPositionStore = {
  position: ReadingPosition | null;
  config: typeof DEFAULT_POSITION_CONFIG;
  setPosition: (position: ReadingPosition) => Promise<void>;
  upsertPosition: (partial: Partial<ReadingPosition>) => Promise<ReadingPosition>;
  updatePosition: (partial: Partial<ReadingPosition>) => Promise<void>;
  clearPosition: () => Promise<void>;
  restorePosition: () => Promise<ReadingPosition | null>;
  applyLearnEvent: (event: LearnEvent) => Promise<ReadingPosition | null>;
};

let eventUnsubscribe: (() => void) | undefined;
let storageUnsubscribe: (() => void) | undefined;

function buildPosition(partial: Partial<ReadingPosition>, current: ReadingPosition | null): ReadingPosition {
  const chapterChanged = !!current && partial.chapterId !== undefined && partial.chapterId !== current.chapterId;
  const lessonChanged = chapterChanged || (!!current && partial.lessonId !== undefined && partial.lessonId !== current.lessonId);
  const sectionChanged = lessonChanged || (!!current && partial.sectionId !== undefined && partial.sectionId !== current.sectionId);
  const exerciseChanged = sectionChanged || (!!current && partial.exerciseId !== undefined && partial.exerciseId !== current.exerciseId);
  const versionChanged = !!current && partial.contentVersion !== undefined && partial.contentVersion !== current.contentVersion;
  const clearSectionPosition = sectionChanged || versionChanged;

  return {
    userId: partial.userId ?? current?.userId ?? getDeviceId(),
    chapterId: partial.chapterId ?? current?.chapterId,
    lessonId: partial.lessonId ?? (chapterChanged ? undefined : current?.lessonId),
    sectionId: partial.sectionId ?? (lessonChanged ? undefined : current?.sectionId),
    contentAnchorId: partial.contentAnchorId ?? (clearSectionPosition ? undefined : current?.contentAnchorId),
    exerciseId: partial.exerciseId ?? (sectionChanged ? undefined : current?.exerciseId),
    stepId: partial.stepId ?? (exerciseChanged ? undefined : current?.stepId),
    scrollOffset: partial.scrollOffset ?? (clearSectionPosition ? undefined : current?.scrollOffset),
    relativeOffset: partial.relativeOffset ?? (clearSectionPosition ? undefined : current?.relativeOffset),
    contentVersion: partial.contentVersion ?? current?.contentVersion ?? 'unknown',
    lastActivity: partial.lastActivity ?? current?.lastActivity ?? 'reading',
    updatedAt: partial.updatedAt ?? new Date(),
    deviceMetadata: partial.deviceMetadata ?? (clearSectionPosition ? undefined : current?.deviceMetadata),
  };
}

export const useReadingPositionStore = create<ReadingPositionStore>((set, get) => ({
  position: null,
  config: DEFAULT_POSITION_CONFIG,

  setPosition: async (position) => {
    const merged = mergeLatestReadingPosition(get().position, position);
    writeReadingPositionToLearningStorage(merged);
    set({ position: merged });
  },

  upsertPosition: async (partial) => {
    const next = buildPosition(partial, get().position);
    writeReadingPositionToLearningStorage(next);
    set({ position: next });
    return next;
  },

  updatePosition: async (partial) => {
    await get().upsertPosition(partial);
  },

  clearPosition: async () => {
    clearReadingPositionFromLearningStorage();
    set({ position: null });
  },

  restorePosition: async () => {
    const stored = readReadingPositionFromLearningStorage();
    if (stored) set({ position: mergeLatestReadingPosition(get().position, stored) });
    return get().position;
  },

  applyLearnEvent: async (event) => {
    const candidate = readingPositionFromLearnEvent(event);
    if (!candidate) return get().position;
    const merged = mergeLatestReadingPosition(get().position, candidate);
    if (merged === get().position) return merged;
    writeReadingPositionToLearningStorage(merged);
    set({ position: merged });
    return merged;
  },
}));

/** Start listening to learn events + learning-storage mirrors (server/tab updates). */
export function startReadingPositionPersistence(): () => void {
  eventUnsubscribe?.();
  storageUnsubscribe?.();

  eventUnsubscribe = subscribeToLearnEvents(event => {
    void useReadingPositionStore.getState().applyLearnEvent(event);
  });

  storageUnsubscribe = subscribeLearningStorage(change => {
    if (change.key !== READING_POSITION_STORAGE_KEY) return;
    const remote = readReadingPositionFromLearningStorage();
    if (!remote) {
      useReadingPositionStore.setState({ position: null });
      return;
    }
    const current = useReadingPositionStore.getState().position;
    const merged = mergeLatestReadingPosition(current, remote);
    if (merged !== current) useReadingPositionStore.setState({ position: merged });
  });

  return () => {
    eventUnsubscribe?.();
    storageUnsubscribe?.();
    eventUnsubscribe = undefined;
    storageUnsubscribe = undefined;
  };
}

export function getMinimalPosition(position: ReadingPosition | null): MinimalReadingPosition | null {
  if (!position) return null;
  return {
    chapterId: position.chapterId,
    lessonId: position.lessonId,
    sectionId: position.sectionId,
    exerciseId: position.exerciseId,
    stepId: position.stepId,
    scrollOffset: position.scrollOffset,
  };
}
