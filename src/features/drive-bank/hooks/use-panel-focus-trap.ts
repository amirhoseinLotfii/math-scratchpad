import { useEffect, useRef, type RefObject } from 'react';

export function usePanelFocusTrap({
  open,
  ready,
  confirmationOpen,
  panelRef,
  connectButtonRef,
  close,
}: {
  open: boolean;
  ready: boolean;
  confirmationOpen: boolean;
  panelRef: RefObject<HTMLElement | null>;
  connectButtonRef: RefObject<HTMLDivElement | null>;
  close: () => void;
}) {
  const closePanelRef = useRef(close);
  closePanelRef.current = close;

  useEffect(() => {
    if (!open) return;
    // Radix menu may restore focus to its trigger after the panel mounts.
    // Reassert initial modal focus on the next frame without stealing focus
    // once the user has already moved inside the panel.
    let followUp = 0;
    const frame = requestAnimationFrame(() => {
      if (!panelRef.current?.contains(document.activeElement)) {
        (ready ? connectButtonRef.current : panelRef.current)?.focus({ preventScroll: true });
      }
      followUp = requestAnimationFrame(() => {
        if (panelRef.current && !panelRef.current.contains(document.activeElement)) {
          (ready ? connectButtonRef.current : panelRef.current)?.focus({ preventScroll: true });
        }
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(followUp);
    };
  }, [open, ready, panelRef, connectButtonRef]);

  // A fixed inspector must also be modal for keyboard and assistive technology.
  // The nested Radix confirmation dialog owns focus while it is visible.
  useEffect(() => {
    if (!open) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (confirmationOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closePanelRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const candidates = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter(node => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden');
      if (!candidates.length) {
        event.preventDefault();
        panelRef.current.focus({ preventScroll: true });
        return;
      }
      const first = candidates[0], last = candidates[candidates.length - 1];
      if (!panelRef.current.contains(document.activeElement)) {
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
  }, [open, confirmationOpen, panelRef]);

  return closePanelRef;
}
