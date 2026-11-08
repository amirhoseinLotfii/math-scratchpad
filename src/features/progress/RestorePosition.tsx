/**
 * RestorePosition Component
 * Handles semantic scroll restoration and position recovery
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useReadingPositionContext } from './ReadingPositionContext';
import { ReadingPosition } from './reading-position-types';

/** Props for RestorePosition component */
export interface RestorePositionProps {
  /** Identifier for the current chapter */
  chapterId?: string;
  
  /** Identifier for the current lesson */
  lessonId?: string;
  
  /** Identifier for the current section */
  sectionId?: string;
  
  /** Identifier for the current exercise */
  exerciseId?: string;
  
  /** Identifier for the current step */
  stepId?: string;
  
  /** Content version for cache invalidation */
  contentVersion?: string;
  
  /** Children to wrap */
  children: React.ReactNode;
  
  /** Custom scroll container ref */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  
  /** Callback when position is restored */
  onPositionRestored?: (position: ReadingPosition) => void;
  
  /** Callback when position fails to restore */
  onRestoreFailed?: (error: Error) => void;
}

/** RestorePosition Component
 * Wraps content and automatically restores scroll position
 */
export function RestorePosition({
  chapterId,
  lessonId,
  sectionId,
  exerciseId,
  stepId,
  contentVersion,
  children,
  scrollContainerRef,
  onPositionRestored,
  onRestoreFailed,
}: RestorePositionProps) {
  const { position, isRestored, restorePosition, trackPosition } = useReadingPositionContext();
  const [isRestoring, setIsRestoring] = useState(false);
  const containerRef = useRef<HTMLElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  /** Check if current content matches the stored position */
  const matchesStoredPosition = useCallback(() => {
    if (!position) return false;
    return position.chapterId === chapterId &&
           position.lessonId === lessonId &&
           position.sectionId === sectionId &&
           position.exerciseId === exerciseId &&
           position.stepId === stepId;
  }, [position, chapterId, lessonId, sectionId, exerciseId, stepId]);

  /** Check if content version matches */
  const versionMatches = useCallback(() => {
    if (!position) return true;
    return position.contentVersion === contentVersion;
  }, [position, contentVersion]);

  /** Restore scroll position */
  const restoreScrollPosition = useCallback(async () => {
    if (!position || !matchesStoredPosition() || !versionMatches()) {
      return;
    }

    setIsRestoring(true);
    
    try {
      // Wait for content to be ready
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const scrollContainer = scrollContainerRef?.current || containerRef.current || window;
      
      if (position.scrollOffset !== undefined) {
        const scrollTarget = scrollContainer === window 
          ? window
          : scrollContainer as HTMLElement;
        
        scrollTarget.scrollTo({
          top: position.scrollOffset,
          behavior: 'auto', // Use auto to avoid smooth scroll jank
        });
      }

      // Find and focus the specific element if available
      if (position.contentAnchorId) {
        const anchor = document.querySelector(`[data-anchor-id="${position.contentAnchorId}"]`);
        if (anchor) {
          anchor.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
      }

      // Notify that position was restored
      onPositionRestored?.(position);
    } catch (error) {
      onRestoreFailed?.(error as Error);
    } finally {
      setIsRestoring(false);
    }
  }, [position, matchesStoredPosition, versionMatches, scrollContainerRef, onPositionRestored, onRestoreFailed]);

  /** Track scroll position */
  const handleScroll = useCallback(() => {
    const scrollContainer = scrollContainerRef?.current || containerRef.current || window;
    const scrollOffset = scrollContainer === window 
      ? window.scrollY
      : (scrollContainer as HTMLElement).scrollTop;
    
    trackPosition({
      chapterId,
      lessonId,
      sectionId,
      exerciseId,
      stepId,
      scrollOffset,
      contentVersion: contentVersion || '1.0',
    });
  }, [chapterId, lessonId, sectionId, exerciseId, stepId, contentVersion, trackPosition, scrollContainerRef]);

  /** Setup scroll listener */
  useEffect(() => {
    const scrollContainer = scrollContainerRef?.current || containerRef.current || window;
    
    const container = scrollContainer === window ? window : scrollContainer as HTMLElement;
    container.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll, scrollContainerRef]);

  /** Restore position when component mounts or content changes */
  useEffect(() => {
    if (isRestored && !isRestoring) {
      restoreScrollPosition();
    }
  }, [isRestored, isRestoring, restoreScrollPosition]);

  /** Track element visibility for semantic anchors */
  useEffect(() => {
    // Setup intersection observer for content anchors
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.target.hasAttribute('data-anchor-id')) {
            const anchorId = entry.target.getAttribute('data-anchor-id');
            if (anchorId) {
              trackPosition({
                chapterId,
                lessonId,
                sectionId,
                exerciseId,
                stepId,
                contentAnchorId: anchorId,
                contentVersion: contentVersion || '1.0',
              });
            }
          }
        });
      },
      {
        rootMargin: '0 -50% 0 0', // Trigger when element is in viewport
        threshold: 0.1,
      }
    );

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [chapterId, lessonId, sectionId, exerciseId, stepId, contentVersion, trackPosition]);

  /** Ref callback for container */
  const containerRefCallback = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    
    // Observe all anchor elements within the container
    if (node && observerRef.current) {
      const anchors = node.querySelectorAll('[data-anchor-id]');
      anchors.forEach(anchor => observerRef.current?.observe(anchor));
    }
  }, []);

  return (
    <div ref={containerRefCallback} className="restore-position-container">
      {children}
    </div>
  );
}

/** Hook for semantic scroll restoration */
export function useSemanticScrollRestoration(
  containerRef: React.RefObject<HTMLElement | null>,
  anchors: string[]
) {
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);

  /** Find the closest anchor above the current scroll position */
  const findClosestAnchor = useCallback(() => {
    const container = containerRef.current;
    if (!container) return null;

    const containerTop = container.getBoundingClientRect().top;
    const containerHeight = container.clientHeight;
    const viewportHeight = window.innerHeight;
    const effectiveTop = Math.max(containerTop, 0);
    const effectiveBottom = Math.min(containerTop + containerHeight, viewportHeight);

    const scrollPosition = container.scrollTop;
    
    let closestAnchor: string | null = null;
    let closestDistance = Infinity;

    anchors.forEach(anchorId => {
      const anchor = container.querySelector(`[data-anchor-id="${anchorId}"]`);
      if (anchor) {
        const anchorRect = anchor.getBoundingClientRect();
        const anchorTop = anchorRect.top - container.getBoundingClientRect().top + container.scrollTop;
        const distance = Math.abs(anchorTop - scrollPosition);
        
        if (distance < closestDistance) {
          closestDistance = distance;
          closestAnchor = anchorId;
        }
      }
    });

    return closestAnchor;
  }, [anchors, containerRef]);

  /** Update active anchor on scroll */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const newActiveAnchor = findClosestAnchor();
      if (newActiveAnchor !== activeAnchor) {
        setActiveAnchor(newActiveAnchor);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    
    // Initial check
    handleScroll();
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [containerRef, findClosestAnchor, activeAnchor]);

  return {
    activeAnchor,
    findClosestAnchor,
    scrollToAnchor: useCallback((anchorId: string, behavior: ScrollBehavior = 'smooth') => {
      const container = containerRef.current;
      if (container) {
        const anchor = container.querySelector(`[data-anchor-id="${anchorId}"]`);
        if (anchor) {
          anchor.scrollIntoView({ behavior, block: 'start' });
        }
      }
    }, [containerRef]),
  };
}
