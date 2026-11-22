import { useEffect, type RefObject } from 'react';

// This panel is visually fixed over the notebook; its keyboard behavior must be
// modal as well. Otherwise Tab reaches inputs hidden behind the overlay.
export function useModalFocusTrap(
  modalRef: RefObject<HTMLElement | null>,
  isClosable: boolean,
  closeRef: RefObject<(() => void) | undefined>,
): void {
  useEffect(() => {
    if (!isClosable) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modalRef.current?.querySelector<HTMLButtonElement>('button[aria-label="بستن تنظیم همگام‌سازی"]')?.focus({ preventScroll: true });
    const focusFrame = window.requestAnimationFrame(() => {
      if (modalRef.current?.isConnected) modalRef.current.querySelector<HTMLButtonElement>('button[aria-label="بستن تنظیم همگام‌سازی"]')?.focus({ preventScroll: true });
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusables = Array.from(modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], iframe, [tabindex]:not([tabindex="-1"])',
      )).filter(element => !element.closest('[hidden]') && getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none');
      if (!focusables.length) {
        event.preventDefault();
        modalRef.current.focus({ preventScroll: true });
        return;
      }
      const first = focusables[0], last = focusables[focusables.length - 1];
      const current = document.activeElement;
      if (!modalRef.current.contains(current)) {
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
  }, [isClosable, modalRef, closeRef]);
}
