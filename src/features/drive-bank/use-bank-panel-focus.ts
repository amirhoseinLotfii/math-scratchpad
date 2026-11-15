import { useEffect, useRef } from 'react';

import { type BankConfirmation } from './bank-session-confirmation';
import type { RefObject } from 'react';
type Options = {
  open: boolean;
  ready: boolean;
  panel: RefObject<HTMLElement | null>;
  connectButton: RefObject<HTMLDivElement | null>;
  close: () => void;
  confirmation: BankConfirmation | null;
};
export function useBankPanelFocus({ open, ready, panel, connectButton, close, confirmation }: Options) {
  useEffect(() => {
    if (!open) return;
    // Radix menu may restore focus to its trigger after the panel mounts.
    // Reassert initial modal focus on the next frame without stealing focus
    // once the user has already moved inside the panel.
    let followUp = 0;
    const frame = requestAnimationFrame(() => {
      if (!panel.current?.contains(document.activeElement)) (ready ? connectButton.current : panel.current)?.focus({ preventScroll: true });
      followUp = requestAnimationFrame(() => {
        if (panel.current && !panel.current.contains(document.activeElement))
          (ready ? connectButton.current : panel.current)?.focus({ preventScroll: true });
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(followUp);
    };
  }, [open, ready]);
  // A fixed inspector must also be modal for keyboard and assistive technology.
  // The nested Radix confirmation dialog owns focus while it is visible.
  const closePanelRef = useRef(close);
  closePanelRef.current = close;
  useEffect(() => {
    if (!open) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (confirmation !== null) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closePanelRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel.current) return;
      const candidates = Array.from(
        panel.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden');
      if (!candidates.length) {
        event.preventDefault();
        panel.current.focus({ preventScroll: true });
        return;
      }
      const first = candidates[0],
        last = candidates[candidates.length - 1];
      if (!panel.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = priorOverflow;
    };
  }, [open, confirmation]);

  return closePanelRef;
}
