import { useCallback, type RefObject } from 'react';
import type { ScratchStore } from '../../store';
import { mathfieldForStep } from '../math-editor/mathlive-adapter';

export function useLessonEditorFocus(store: ScratchStore, root: RefObject<HTMLElement | null>) {
  const focusEditor = useCallback(() => {
    const stepId = store.getState().doc.cursor.stepId;
    const active = mathfieldForStep(stepId);
    if (active) active.focus();
    else root.current?.focus({ preventScroll: true });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const current = mathfieldForStep(store.getState().doc.cursor.stepId);
        if (!current) return;
        if (!current.hasFocus()) current.focus();
        // Unlike the page, the wide lesson's work pane has its own scroll container.
        current.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
        const rect = current.getBoundingClientRect();
        const source = root.current?.closest('.lesson-check')?.querySelector<HTMLElement>('.lesson-check-source');
        const sourceRect = source?.getBoundingClientRect();
        const stickyTop = source ? Number.parseFloat(getComputedStyle(source).top) || 0 : 0;
        const sourcePinned = !!source && getComputedStyle(source).position === 'sticky' && !!sourceRect && sourceRect.top <= stickyTop + 1;
        const visibleTop = sourcePinned && sourceRect ? sourceRect.bottom + 8 : 8;
        const viewport = window.visualViewport;
        const visibleBottom = Math.min(window.innerHeight, viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - 8;
        if (rect.top < visibleTop) window.scrollBy({ top: rect.top - visibleTop, behavior: 'auto' });
        else if (rect.bottom > visibleBottom) window.scrollBy({ top: rect.bottom - visibleBottom, behavior: 'auto' });
        // When the user opens the in-app keypad, the first row must be visible
        // without manually scrolling past unrelated exercise controls.
        const firstKey = root.current?.querySelector<HTMLElement>('.math-keyboard .key-grid button');
        const keyRect = firstKey?.getBoundingClientRect();
        const workScroll = firstKey?.closest<HTMLElement>('.lesson-split-work');
        const workBounds = workScroll?.getBoundingClientRect();
        if (keyRect && workScroll && workBounds && keyRect.bottom > workBounds.bottom - 8) {
          workScroll.scrollTop += keyRect.bottom - workBounds.bottom + 12;
        } else if (keyRect && keyRect.bottom > visibleBottom) {
          window.scrollBy({ top: keyRect.bottom - visibleBottom + 12, behavior: 'auto' });
        }
      }),
    );
  }, [store, root]);
  return focusEditor;
}
