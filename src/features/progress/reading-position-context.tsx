import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getDeviceId } from '../../sync/events';
import { ReadingPosition, MinimalReadingPosition } from './reading-position-types';
import { startReadingPositionPersistence, useReadingPositionStore } from './reading-position-store';

interface ReadingPositionContextType {
  position: ReadingPosition | null;
  isLoading: boolean;
  isRestored: boolean;
  trackPosition: (position: Partial<ReadingPosition>) => Promise<void>;
  updatePosition: (partial: Partial<ReadingPosition>) => Promise<void>;
  clearPosition: () => Promise<void>;
  restorePosition: () => Promise<ReadingPosition | null>;
  navigateToPosition: (position: MinimalReadingPosition) => Promise<void>;
  getMinimalPosition: () => MinimalReadingPosition | null;
}

const ReadingPositionContext = createContext<ReadingPositionContextType | null>(null);

export function ReadingPositionProvider({ children }: { children: React.ReactNode }) {
  // Subscribe only to the state/actions this provider exposes. Zustand action
  // references are stable, so position updates do not recreate tracking callbacks.
  const position = useReadingPositionStore(state => state.position);
  const upsertPosition = useReadingPositionStore(state => state.upsertPosition);
  const updatePosition = useReadingPositionStore(state => state.updatePosition);
  const clearPosition = useReadingPositionStore(state => state.clearPosition);
  const storeRestorePosition = useReadingPositionStore(state => state.restorePosition);

  const [isLoading, setIsLoading] = useState(true);
  const [isRestored, setIsRestored] = useState(false);

  useEffect(() => {
    if (position) setIsRestored(true);
  }, [position]);

  useEffect(() => {
    const stop = startReadingPositionPersistence();
    const restore = async () => {
      setIsLoading(true);
      try {
        const restored = await storeRestorePosition();
        setIsRestored(!!restored);
      } finally {
        setIsLoading(false);
      }
    };
    void restore();
    return stop;
  }, [storeRestorePosition]);

  const navigateToPosition = useCallback(async (minimalPosition: MinimalReadingPosition) => {
    const currentPosition = useReadingPositionStore.getState().position;
    await upsertPosition({
      userId: currentPosition?.userId ?? getDeviceId(),
      chapterId: minimalPosition.chapterId,
      lessonId: minimalPosition.lessonId,
      sectionId: minimalPosition.sectionId,
      exerciseId: minimalPosition.exerciseId,
      stepId: minimalPosition.stepId,
      scrollOffset: minimalPosition.scrollOffset,
      contentVersion: currentPosition?.contentVersion ?? 'unknown',
      lastActivity: 'reading',
      updatedAt: new Date(),
    });
  }, [upsertPosition]);

  // Keep this callback stable across position updates. Lesson effects depend on
  // it to record a location change; capturing position here caused a feedback
  // loop: write -> Zustand update -> provider render -> new callback -> write.
  const trackPosition = useCallback(async (partial: Partial<ReadingPosition>) => {
    const currentPosition = useReadingPositionStore.getState().position;
    await upsertPosition({
      ...partial,
      userId: partial.userId ?? currentPosition?.userId ?? getDeviceId(),
      updatedAt: partial.updatedAt ?? new Date(),
    });
  }, [upsertPosition]);

  const getMinimalPosition = useCallback((): MinimalReadingPosition | null => {
    const currentPosition = useReadingPositionStore.getState().position;
    if (!currentPosition) return null;
    return {
      chapterId: currentPosition.chapterId,
      lessonId: currentPosition.lessonId,
      sectionId: currentPosition.sectionId,
      exerciseId: currentPosition.exerciseId,
      stepId: currentPosition.stepId,
      scrollOffset: currentPosition.scrollOffset,
    };
  }, []);

  const value = useMemo<ReadingPositionContextType>(() => ({
    position,
    isLoading,
    isRestored,
    trackPosition,
    updatePosition,
    clearPosition,
    restorePosition: storeRestorePosition,
    navigateToPosition,
    getMinimalPosition,
  }), [
    position,
    isLoading,
    isRestored,
    trackPosition,
    updatePosition,
    clearPosition,
    storeRestorePosition,
    navigateToPosition,
    getMinimalPosition,
  ]);

  return (
    <ReadingPositionContext.Provider value={value}>
      {children}
    </ReadingPositionContext.Provider>
  );
}

export function useReadingPositionContext() {
  const context = useContext(ReadingPositionContext);
  if (!context) {
    throw new Error('useReadingPositionContext must be used within a ReadingPositionProvider');
  }
  return context;
}

export function useOptionalReadingPositionContext() {
  return useContext(ReadingPositionContext);
}

export function ContinueLearningButton({ onClick }: { onClick: () => void }) {
  const { position, isLoading } = useReadingPositionContext();

  if (isLoading || !position?.lessonId) return null;

  return (
    <div className="continue-learning-container">
      <button
        type="button"
        className="continue-learning-button"
        aria-label={`Continue from lesson ${position.lessonId}`}
        onClick={onClick}
      >
        Continue learning
        <span className="continue-learning-details" dir="ltr">
          {position.lessonId}{position.sectionId ? ` · ${position.sectionId}` : ''}
        </span>
      </button>
    </div>
  );
}
