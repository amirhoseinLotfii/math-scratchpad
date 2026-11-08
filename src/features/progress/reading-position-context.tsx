import React, { createContext, useContext, useEffect, useState } from 'react';
import { ReadingPosition, MinimalReadingPosition } from './reading-position-types';
import { useReadingPositionStore } from './reading-position-store';

/** Context type for reading position */
interface ReadingPositionContextType {
  /** Current reading position */
  position: ReadingPosition | null;
  
  /** Whether position is being loaded */
  isLoading: boolean;
  
  /** Whether position has been restored */
  isRestored: boolean;
  
  /** Track current position */
  trackPosition: (position: Partial<ReadingPosition>) => Promise<void>;
  
  /** Update current position */
  updatePosition: (partial: Partial<ReadingPosition>) => Promise<void>;
  
  /** Clear current position */
  clearPosition: () => Promise<void>;
  
  /** Restore position from storage */
  restorePosition: () => Promise<ReadingPosition | null>;
  
  /** Navigate to a specific position */
  navigateToPosition: (position: MinimalReadingPosition) => Promise<void>;
  
  /** Get minimal position for sharing */
  getMinimalPosition: () => MinimalReadingPosition | null;
}

/** Default context value */
const ReadingPositionContext = createContext<ReadingPositionContextType | null>(null);

/** Provider component */
export function ReadingPositionProvider({ children }: { children: React.ReactNode }) {
  const {
    position,
    setPosition,
    updatePosition,
    clearPosition,
    restorePosition: storeRestorePosition,
  } = useReadingPositionStore();

  const [isLoading, setIsLoading] = useState(true);
  const [isRestored, setIsRestored] = useState(false);

  // Restore position on mount
  useEffect(() => {
    const restore = async () => {
      setIsLoading(true);
      try {
        const restored = await storeRestorePosition();
        setIsRestored(!!restored);
      } finally {
        setIsLoading(false);
      }
    };
    restore();
  }, [storeRestorePosition]);

  /** Navigate to a specific position */
  const navigateToPosition = async (minimalPosition: MinimalReadingPosition) => {
    // Store the position we're navigating to
    const fullPosition: ReadingPosition = {
      userId: position?.userId ?? 'currentUser',
      chapterId: minimalPosition.chapterId,
      lessonId: minimalPosition.lessonId,
      sectionId: minimalPosition.sectionId,
      exerciseId: minimalPosition.exerciseId,
      stepId: minimalPosition.stepId,
      scrollOffset: minimalPosition.scrollOffset,
      contentVersion: '1.0',
      lastActivity: 'reading',
      updatedAt: new Date(),
    };
    
    await setPosition(fullPosition);
    
    // In a real implementation, this would trigger navigation
    // For now, just store the position
  };

  const trackPosition = async (partial: Partial<ReadingPosition>) => {
    await setPosition({
      ...(position ?? {}),
      ...partial,
      userId: partial.userId ?? position?.userId ?? 'currentUser',
      contentVersion: partial.contentVersion ?? position?.contentVersion ?? '1.0',
      lastActivity: partial.lastActivity ?? position?.lastActivity ?? 'reading',
      updatedAt: new Date(),
    });
  };

  /** Get minimal position for sharing */
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

/** Hook to use reading position context */
export function useReadingPositionContext() {
  const context = useContext(ReadingPositionContext);
  if (!context) {
    throw new Error('useReadingPositionContext must be used within a ReadingPositionProvider');
  }
  return context;
}

/** Component to display continue learning button */
export function ContinueLearningButton() {
  const { position, getMinimalPosition, isLoading, isRestored } = useReadingPositionContext();

  if (isLoading || !isRestored || !position) {
    return null;
  }

  const hasMeaningfulPosition = position.chapterId || position.lessonId;
  if (!hasMeaningfulPosition) {
    return null;
  }

  return (
    <div className="continue-learning-container">
      <button 
        className="continue-learning-button"
        aria-label="Continue from where you left off"
      >
        Continue Learning
        {position.lessonId && (
          <span className="continue-learning-details">
            {/* Show lesson info if available */}
          </span>
        )}
      </button>
    </div>
  );
}
