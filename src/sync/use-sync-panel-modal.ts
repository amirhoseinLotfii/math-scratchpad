import { useEffect, useRef } from 'react';

export function useSyncPanelModal(onClose?: () => void) {
  const modal = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const isClosable = !!onClose;
  // This panel is visually fixed over the notebook; its keyboard behavior must be
  // modal as well. Otherwise Tab reaches inputs hidden behind the overlay.
  useEffect(() => {
    if (!isClosable) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modal.current?.querySelector<HTMLButtonElement>('button[aria-label="بستن تنظیم همگام‌سازی"]')?.focus({ preventScroll: true });
    const focusFrame = window.requestAnimationFrame(() => {
      if (modal.current?.isConnected)
        modal.current.querySelector<HTMLButtonElement>('button[aria-label="بستن تنظیم همگام‌سازی"]')?.focus({ preventScroll: true });
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !modal.current) return;
      const focusables = Array.from(
        modal.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], iframe, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          !element.closest('[hidden]') && getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none',
      );
      if (!focusables.length) {
        event.preventDefault();
        modal.current.focus({ preventScroll: true });
        return;
      }
      const first = focusables[0],
        last = focusables[focusables.length - 1];
      const current = document.activeElement;
      if (!modal.current.contains(current)) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      } else if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [isClosable]);

  return { modal, closeRef, isClosable };
}
