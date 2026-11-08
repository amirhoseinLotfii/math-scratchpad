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
  return {
    userId: partial.userId ?? current?.userId ?? getDeviceId(),
    chapterId: partial.chapterId ?? current?.chapterId,
    lessonId: partial.lessonId ?? current?.lessonId,
    sectionId: partial.sectionId ?? current?.sectionId,
    contentAnchorId: partial.contentAnchorId ?? current?.contentAnchorId,
    exerciseId: partial.exerciseId ?? current?.exerciseId,
    stepId: partial.stepId ?? current?.stepId,
    scrollOffset: partial.scrollOffset ?? current?.scrollOffset,
    relativeOffset: partial.relativeOffset ?? current?.relativeOffset,
    contentVersion: partial.contentVersion ?? current?.contentVersion ?? 'unknown',
    lastActivity: partial.lastActivity ?? current?.lastActivity ?? 'reading',
    updatedAt: partial.updatedAt ?? new Date(),
    deviceMetadata: partial.deviceMetadata ?? current?.deviceMetadata,
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
    const merged = mergeLatestReadingPosition(get().position, next);
    writeReadingPositionToLearningStorage(merged);
    set({ position: merged });
    return merged;
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
