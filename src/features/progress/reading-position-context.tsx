import React, { createContext, useContext, useEffect, useState } from 'react';
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
  const {
    position,
    upsertPosition,
    updatePosition,
    clearPosition,
    restorePosition: storeRestorePosition,
  } = useReadingPositionStore();

  const [isLoading, setIsLoading] = useState(true);
  const [isRestored, setIsRestored] = useState(false);

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

  const navigateToPosition = async (minimalPosition: MinimalReadingPosition) => {
    await upsertPosition({
      userId: position?.userId ?? getDeviceId(),
      chapterId: minimalPosition.chapterId,
      lessonId: minimalPosition.lessonId,
      sectionId: minimalPosition.sectionId,
      exerciseId: minimalPosition.exerciseId,
      stepId: minimalPosition.stepId,
      scrollOffset: minimalPosition.scrollOffset,
      contentVersion: position?.contentVersion ?? 'unknown',
      lastActivity: 'reading',
      updatedAt: new Date(),
    });
  };

  const trackPosition = async (partial: Partial<ReadingPosition>) => {
    await upsertPosition({
      ...partial,
      userId: partial.userId ?? position?.userId ?? getDeviceId(),
      updatedAt: partial.updatedAt ?? new Date(),
    });
  };

  const getMinimalPosition = (): MinimalReadingPosition | null => {
    if (!position) return null;
    return {
      chapterId: position.chapterId,
      lessonId: position.lessonId,
      sectionId: position.sectionId,
      exerciseId: position.exerciseId,
      stepId: position.stepId,
      scrollOffset: position.scrollOffset,
    };
  };

  const value: ReadingPositionContextType = {
    position,
    isLoading,
    isRestored,
    trackPosition,
    updatePosition,
    clearPosition,
    restorePosition: storeRestorePosition,
    navigateToPosition,
    getMinimalPosition,
  };

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

export function ContinueLearningButton() {
  const { position, isLoading, isRestored } = useReadingPositionContext();

  if (isLoading || !isRestored || !position) return null;
  if (!position.chapterId && !position.lessonId) return null;

  return (
    <div className="continue-learning-container">
      <button
        type="button"
        className="continue-learning-button"
        aria-label="Continue from where you left off"
      >
        Continue Learning
        {position.lessonId ? (
          <span className="continue-learning-details" dir="ltr">{position.lessonId}</span>
        ) : null}
      </button>
    </div>
  );
}
