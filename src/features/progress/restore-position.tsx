import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useOptionalReadingPositionContext } from './reading-position-context';
import type { ReadingPosition } from './reading-position-types';

interface RestorePositionProps {
  children: React.ReactNode;
  chapterId?: string;
  lessonId?: string;
  sectionId?: string;
  exerciseId?: string;
  stepId?: string;
  contentVersion?: string;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  onPositionRestored?: (position: ReadingPosition) => void;
  onRestoreFailed?: (error: Error) => void;
}

function clampOffset(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function positionKey(position: ReadingPosition): string {
  const updatedAt = position.updatedAt instanceof Date
    ? position.updatedAt.toISOString()
    : String(position.updatedAt ?? '');
  return [
    position.userId, position.chapterId, position.lessonId, position.sectionId,
    position.exerciseId, position.stepId, position.contentAnchorId,
    position.scrollOffset, position.relativeOffset, position.contentVersion, updatedAt,
  ].join('|');
}

/**
 * Restores and records a semantic lesson position. Scroll writes are debounced,
 * anchor offsets are viewport-relative, and remote updates never yank the page
 * after the learner has started interacting.
 */
export function RestorePosition({
  children,
  chapterId,
  lessonId,
  sectionId,
  exerciseId,
  stepId,
  contentVersion,
  scrollContainerRef,
  onPositionRestored,
  onRestoreFailed,
}: RestorePositionProps) {
  const context = useOptionalReadingPositionContext();
  const position = context?.position ?? null;
  const isRestored = context?.isRestored ?? false;
  const trackPosition = context?.trackPosition;
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPositionRef = useRef<Partial<ReadingPosition> | null>(null);
  const isRestoringRef = useRef(false);
  const userInteractedRef = useRef(false);
  const lastRestoredKeyRef = useRef<string | null>(null);

  const matchesStoredPosition = useCallback((stored: ReadingPosition) => (
    (chapterId === undefined || stored.chapterId === chapterId) &&
    (lessonId === undefined || stored.lessonId === lessonId) &&
    (sectionId === undefined || stored.sectionId === sectionId) &&
    (exerciseId === undefined || stored.exerciseId === exerciseId) &&
    (stepId === undefined || stored.stepId === stepId) &&
    (contentVersion === undefined || stored.contentVersion === contentVersion)
  ), [chapterId, lessonId, sectionId, exerciseId, stepId, contentVersion]);

  const snapshotScrollPosition = useCallback((): Partial<ReadingPosition> => {
    const scrollContainer = scrollContainerRef?.current ?? null;
    const rootTop = scrollContainer?.getBoundingClientRect().top ?? 0;
    const anchors = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>('[data-anchor-id]') ?? [],
    );
    const measured = anchors.map(anchor => ({ anchor, rect: anchor.getBoundingClientRect() }));
    const visible = measured.filter(({ rect }) => rect.bottom > rootTop + 8);
    const active = visible.filter(({ rect }) => rect.top <= rootTop + 48).at(-1) ?? visible[0];
    const relativeOffset = active
      ? clampOffset((rootTop - active.rect.top) / Math.max(active.rect.height, 1))
      : undefined;

    return {
      chapterId,
      lessonId,
      sectionId,
      ...(exerciseId === undefined ? {} : { exerciseId }),
      ...(stepId === undefined ? {} : { stepId }),
      contentVersion,
      scrollOffset: scrollContainer ? scrollContainer.scrollTop : window.scrollY,
      ...(active?.anchor.dataset.anchorId ? { contentAnchorId: active.anchor.dataset.anchorId } : {}),
      ...(relativeOffset === undefined ? {} : { relativeOffset }),
      lastActivity: 'reading',
    };
  }, [chapterId, lessonId, sectionId, exerciseId, stepId, contentVersion, scrollContainerRef]);

  const flushPendingPosition = useCallback(() => {
    if (scrollTimerRef.current !== null) {
      clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = null;
    }
    const pending = pendingPositionRef.current;
    pendingPositionRef.current = null;
    if (pending && trackPosition) void trackPosition(pending).catch(() => {});
  }, [trackPosition]);

  const schedulePositionWrite = useCallback((next: Partial<ReadingPosition>) => {
    pendingPositionRef.current = next;
    if (scrollTimerRef.current !== null) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(flushPendingPosition, 350);
  }, [flushPendingPosition]);

  const handleScroll = useCallback(() => {
    if (!trackPosition || isRestoringRef.current) return;
    schedulePositionWrite(snapshotScrollPosition());
  }, [trackPosition, schedulePositionWrite, snapshotScrollPosition]);

  const handleUserInteraction = useCallback(() => {
    if (!isRestoringRef.current) userInteractedRef.current = true;
  }, []);

  useEffect(() => {
    userInteractedRef.current = false;
    lastRestoredKeyRef.current = null;
  }, [chapterId, lessonId, sectionId, contentVersion, scrollContainerRef]);

  useEffect(() => {
    const target: EventTarget = scrollContainerRef?.current ?? window;
    target.addEventListener('scroll', handleScroll, { passive: true });
    target.addEventListener('wheel', handleUserInteraction, { passive: true });
    target.addEventListener('touchstart', handleUserInteraction, { passive: true });
    target.addEventListener('pointerdown', handleUserInteraction, { passive: true });
    target.addEventListener('keydown', handleUserInteraction);
    const handlePageHide = () => flushPendingPosition();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushPendingPosition();
    };
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      target.removeEventListener('scroll', handleScroll);
      target.removeEventListener('wheel', handleUserInteraction);
      target.removeEventListener('touchstart', handleUserInteraction);
      target.removeEventListener('pointerdown', handleUserInteraction);
      target.removeEventListener('keydown', handleUserInteraction);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushPendingPosition();
    };
  }, [scrollContainerRef, handleScroll, handleUserInteraction, flushPendingPosition]);

  useEffect(() => {
    if (!isRestored || !position || !matchesStoredPosition(position) || userInteractedRef.current) return;
    const key = positionKey(position);
    if (lastRestoredKeyRef.current === key) return;
    lastRestoredKeyRef.current = key;
    isRestoringRef.current = true;

    let releaseFrame: number | null = null;
    const frame = requestAnimationFrame(() => {
      try {
        const scrollContainer = scrollContainerRef?.current ?? null;
        const rootTop = scrollContainer?.getBoundingClientRect().top ?? 0;
        const anchor = position.contentAnchorId
          ? Array.from(containerRef.current?.querySelectorAll<HTMLElement>('[data-anchor-id]') ?? [])
              .find(element => element.dataset.anchorId === position.contentAnchorId)
          : undefined;

        if (anchor) {
          const relativeOffset = clampOffset(position.relativeOffset ?? 0);
          const desiredTop = rootTop - relativeOffset * anchor.getBoundingClientRect().height;
          const delta = anchor.getBoundingClientRect().top - desiredTop;
          if (Math.abs(delta) > 1) {
            if (scrollContainer) scrollContainer.scrollBy({ top: delta, behavior: 'auto' });
            else window.scrollBy({ top: delta, behavior: 'auto' });
          }
        } else if (position.scrollOffset !== undefined) {
          if (scrollContainer) scrollContainer.scrollTo({ top: position.scrollOffset, behavior: 'auto' });
          else window.scrollTo({ top: position.scrollOffset, behavior: 'auto' });
        }
        onPositionRestored?.(position);
      } catch (error) {
        onRestoreFailed?.(error instanceof Error ? error : new Error(String(error)));
      } finally {
        releaseFrame = requestAnimationFrame(() => { isRestoringRef.current = false; });
      }
    });

    return () => {
      cancelAnimationFrame(frame);
      if (releaseFrame !== null) cancelAnimationFrame(releaseFrame);
      isRestoringRef.current = false;
    };
  }, [isRestored, position, matchesStoredPosition, scrollContainerRef, onPositionRestored, onRestoreFailed]);

  return <div ref={containerRef} className="restore-position-container">{children}</div>;
}

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
