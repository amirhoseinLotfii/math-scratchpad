import { useCallback, useEffect, useRef } from 'react';
import { useReadingPositionStore } from './reading-position-store';
import { ReadingPosition, ReadingActivityType, MinimalReadingPosition } from './reading-position-types';

/** Element reference with scroll position tracking */
export interface TrackedElement {
  element: HTMLElement | null;
  scrollContainer?: HTMLElement | null;
}

/** Throttled position update function */
function useThrottledPositionUpdate(
  updatePosition: (position: Partial<ReadingPosition>) => Promise<void>,
  debounceTime: number = 500
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  return useCallback((position: Partial<ReadingPosition>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      updatePosition(position);
    }, debounceTime);
  }, [updatePosition, debounceTime]);
}

/** Hook for managing reading position */
export function useReadingPosition() {
  const {
    position,
    setPosition,
    updatePosition,
    clearPosition,
    restorePosition,
    config,
  } = useReadingPositionStore();

  const throttledUpdate = useThrottledPositionUpdate(updatePosition, config.debounceTime);

  /** Track current position based on URL and scroll */
  const trackPosition = useCallback((
    chapterId?: string,
    lessonId?: string,
    sectionId?: string,
    exerciseId?: string,
    stepId?: string,
    scrollOffset?: number,
    activity: ReadingActivityType = 'reading'
  ) => {
    const positionData: Partial<ReadingPosition> = {
      chapterId,
      lessonId,
      sectionId,
      exerciseId,
      stepId,
      scrollOffset,
      lastActivity: activity,
      updatedAt: new Date(),
    };
    
    throttledUpdate(positionData);
  }, [throttledUpdate]);

  /** Track position from scroll events */
  const trackScrollPosition = useCallback((
    element: HTMLElement | null,
    scrollContainer: HTMLElement | Window = window,
    context: {
      chapterId?: string;
      lessonId?: string;
      sectionId?: string;
      exerciseId?: string;
      stepId?: string;
    } = {}
  ) => {
    const handleScroll = () => {
      const scrollOffset = scrollContainer === window 
        ? window.scrollY
        : (scrollContainer as HTMLElement).scrollTop;
      
      trackPosition(
        context.chapterId,
        context.lessonId,
        context.sectionId,
        context.exerciseId,
        context.stepId,
        scrollOffset,
        'reading'
      );
    };

    useEffect(() => {
      const container = scrollContainer === window ? window : scrollContainer as HTMLElement;
      container.addEventListener('scroll', handleScroll, { passive: true });
      return () => {
        container.removeEventListener('scroll', handleScroll);
      };
    }, [element, scrollContainer, context, handleScroll]);
  }, [trackPosition]);

  /** Save position when navigating away */
  const savePositionOnNavigate = useCallback((
    chapterId?: string,
    lessonId?: string,
    sectionId?: string,
    exerciseId?: string,
    stepId?: string,
    activity: ReadingActivityType = 'reading'
  ) => {
    const positionData: Partial<ReadingPosition> = {
      chapterId,
      lessonId,
      sectionId,
      exerciseId,
      stepId,
      lastActivity: activity,
      updatedAt: new Date(),
    };
    
    // Flush immediately for navigation
    updatePosition(positionData);
  }, [updatePosition]);

  /** Restore to a specific position */
  const goToPosition = useCallback((
    position: MinimalReadingPosition,
    scrollBehavior: ScrollBehavior = 'smooth'
  ) => {
    // This would be implemented by the consuming component
    // to handle the actual navigation and scrolling
    return position;
  }, []);

  /** Get current minimal position for sharing */
  const getCurrentMinimalPosition = useCallback((): MinimalReadingPosition | null => {
    if (!position) return null;
    return {
      chapterId: position.chapterId,
      lessonId: position.lessonId,
      sectionId: position.sectionId,
      exerciseId: position.exerciseId,
      stepId: position.stepId,
      scrollOffset: position.scrollOffset,
    };
  }, [position]);

  return {
    position,
    trackPosition,
    trackScrollPosition,
    savePositionOnNavigate,
    goToPosition,
    getCurrentMinimalPosition,
    clearPosition,
    restorePosition,
  };
}

/** Hook for tracking lesson reading position */
export function useLessonPosition(
  lessonId: string,
  sectionId?: string,
  exerciseId?: string,
  stepId?: string
) {
  const { trackPosition, trackScrollPosition, savePositionOnNavigate } = useReadingPosition();

  /** Track section position */
  const trackSectionPosition = useCallback((scrollOffset?: number) => {
    trackPosition(undefined, lessonId, sectionId, exerciseId, stepId, scrollOffset);
  }, [lessonId, sectionId, exerciseId, stepId, trackPosition]);

  /** Save position when completing an activity */
  const trackActivity = useCallback((activity: ReadingActivityType) => {
    savePositionOnNavigate(undefined, lessonId, sectionId, exerciseId, stepId, activity);
  }, [lessonId, sectionId, exerciseId, stepId, savePositionOnNavigate]);

  return {
    trackSectionPosition,
    trackScrollPosition,
    trackActivity,
  };
}
