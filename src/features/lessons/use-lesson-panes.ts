import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { type LessonProgress } from './types';
import { clampSplitRatio, lessonPaneMode, ratioFromPointer, SPLIT_MEDIA_QUERY, SPLIT_RATIO_STORAGE_KEY } from './lesson-work-items';
import { getLearningStorage } from '../../sync/browser-db';

import type { RefObject } from 'react';
import type { LessonRestoreTarget } from './lesson-screen-types';

type Options = {
  initialProgress?: LessonProgress;
  restore?: LessonRestoreTarget;
  summary: boolean;
  sectionIndex: number;
  headingRef: RefObject<HTMLHeadingElement | null>;
  summaryHeadingRef: RefObject<HTMLHeadingElement | null>;
  fa: boolean;
};
function subscribeSplit(change: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const list = window.matchMedia(SPLIT_MEDIA_QUERY);
  list.addEventListener?.('change', change);
  return () => list.removeEventListener?.('change', change);
}
function splitSnapshot() {
  return typeof window.matchMedia === 'function' && window.matchMedia(SPLIT_MEDIA_QUERY).matches;
}
function readSplitRatio() {
  try {
    return clampSplitRatio(getLearningStorage().getItem(SPLIT_RATIO_STORAGE_KEY) ?? undefined);
  } catch {
    return clampSplitRatio(undefined);
  }
}
function writeSplitRatio(value: number) {
  try {
    getLearningStorage().setItem(SPLIT_RATIO_STORAGE_KEY, String(value));
  } catch {
    /* preference only */
  }
}

export function useLessonPanes({ initialProgress, restore, summary, sectionIndex, headingRef, summaryHeadingRef, fa }: Options) {
  const paneMode = lessonPaneMode(useSyncExternalStore(subscribeSplit, splitSnapshot, () => false)),
    split = paneMode === 'split';
  const [splitRatio, setSplitRatio] = useState(readSplitRatio);
  const [paneTab, setPaneTab] = useState<'lesson' | 'work'>(() =>
    Object.keys(initialProgress?.workAnswers ?? {}).length ? 'work' : 'lesson',
  );
  const [selectedWorkKey, setSelectedWorkKey] = useState<string | undefined>(() => Object.keys(initialProgress?.workAnswers ?? {}).at(-1));
  const splitRef = useRef<HTMLDivElement>(null);
  const lessonScrollRef = useRef<HTMLDivElement>(null);
  const restoredScrollRef = useRef(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const target = (summary ? summaryHeadingRef : headingRef).current;
    target?.focus({ preventScroll: true });
    // In split mode the section heading lives in the pinned pane header.
    // Reset only the lesson body when the learner changes sections; never move the outer document.
    if (split && !summary) document.querySelector<HTMLElement>('.lesson-split-lesson-scroll')?.scrollTo?.({ top: 0, behavior: 'auto' });
    else target?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
  }, [sectionIndex, summary, split]);

  // One-shot restoration for an explicit continue request. It runs after the
  // section heading effect above, so scrolling to the stored anchor wins. It
  // never focuses the math field or opens the keyboard.
  useEffect(() => {
    if (!restore || summary || restoredScrollRef.current) return;
    restoredScrollRef.current = true;
    const frame = requestAnimationFrame(() => {
      const container = lessonScrollRef.current;
      const anchorId = restore.contentAnchorId;
      if (anchorId) {
        const anchors = Array.from(document.querySelectorAll<HTMLElement>('[data-anchor-id]'));
        const anchor = anchors.find((element) => element.dataset.anchorId === anchorId);
        if (anchor) {
          anchor.scrollIntoView?.({ block: 'start', behavior: 'auto' });
          return;
        }
      }
      if (typeof restore.scrollOffset !== 'number') return;
      if (container) container.scrollTop = restore.scrollOffset;
      else window.scrollTo?.({ top: restore.scrollOffset, behavior: 'auto' });
    });
    return () => cancelAnimationFrame(frame);
  }, [restore, summary]);

  const selectPaneTab = useCallback((next: 'lesson' | 'work', moveFocus = false) => {
    setPaneTab(next);
    if (moveFocus) requestAnimationFrame(() => tabRefs.current[next === 'lesson' ? 0 : 1]?.focus());
  }, []);

  // WAI-ARIA tabs pattern: one tab stop for the whole tab list, arrows move
  // between tabs, Home/End jump to the first/last tab. Direction follows the UI language.
  const handleTabKeys = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
      const forward = fa ? 'ArrowLeft' : 'ArrowRight';
      const backward = fa ? 'ArrowRight' : 'ArrowLeft';
      let next: number | null = null;
      if (event.key === forward || event.key === backward) next = index === 0 ? 1 : 0;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = 1;
      if (next === null) return;
      event.preventDefault();
      selectPaneTab(next === 0 ? 'lesson' : 'work', true);
    },
    [fa, selectPaneTab],
  );

  const updateSplitRatio = useCallback((value: number) => {
    const next = clampSplitRatio(value);
    setSplitRatio(next);
    writeSplitRatio(next);
  }, []);
  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    const container = splitRef.current;
    if (!container) return;
    event.preventDefault();
    const rtl = getComputedStyle(container).direction === 'rtl';
    const move = (e: PointerEvent) => updateSplitRatio(ratioFromPointer(e.clientX, container.getBoundingClientRect(), rtl));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  function resizeByKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    const rtl = splitRef.current ? getComputedStyle(splitRef.current).direction === 'rtl' : fa;
    const grow = rtl ? 'ArrowLeft' : 'ArrowRight',
      shrink = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === grow) {
      event.preventDefault();
      updateSplitRatio(splitRatio + 5);
    } else if (event.key === shrink) {
      event.preventDefault();
      updateSplitRatio(splitRatio - 5);
    } else if (event.key === 'Home') {
      event.preventDefault();
      updateSplitRatio(30);
    } else if (event.key === 'End') {
      event.preventDefault();
      updateSplitRatio(70);
    }
  }

  return {
    paneMode,
    split,
    splitRatio,
    paneTab,
    selectedWorkKey,
    setSelectedWorkKey,
    splitRef,
    lessonScrollRef,
    tabRefs,
    selectPaneTab,
    handleTabKeys,
    updateSplitRatio,
    startResize,
    resizeByKey,
  };
}
