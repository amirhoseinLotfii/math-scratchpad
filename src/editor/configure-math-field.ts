import { MathfieldElement } from 'mathlive';

export type ConfigureMathFieldOptions = {
  locale?: string;
  uiLang?: 'fa' | 'en';
  onShiftEnter?: (mf: MathfieldElement) => void;
  onDoubleSlash?: () => void;
  onSingleSlash?: () => void;
};

// Global font setup: prevent mathlive from fetching external Google Fonts or CDN fonts
if (typeof MathfieldElement !== 'undefined') {
  MathfieldElement.fontsDirectory = null;
}

/**
 * Configures a MathfieldElement according to the Math Scratchpad Master Specification (§6.2).
 * Handles mathModeSpace, farsi locale, focus mitigation for .ML__keyboard-sink (#2588, #2644),
 * Shift+Enter multiline addRowAfter (#2551, #2650), and double '/' tools expansion.
 */
export function configureMathField(
  mf: MathfieldElement,
  options?: ConfigureMathFieldOptions
): () => void {
  mf.defaultMode = 'math';
  mf.smartMode = false;
  // Thick math space (\;) so pressing Space in math mode inserts visible spacing instead of dropping (AC-T2)
  mf.mathModeSpace = String.raw`\;`;
  mf.mathVirtualKeyboardPolicy = 'manual';

  const uiLang = options?.uiLang ?? 'fa';
  if (uiLang === 'fa' || options?.locale === 'farsi') {
    mf.locale = 'farsi';
  }

  // Focus mitigation: first-click pointerdown on Chromium shadow DOM sink (#2588, #2644)
  const handlePointerDown = () => {
    requestAnimationFrame(() => {
      const sink = mf.shadowRoot?.querySelector<HTMLElement>('.ML__keyboard-sink');
      if (sink && document.activeElement !== sink) {
        sink.blur();
        sink.focus();
      }
    });
  };
  mf.addEventListener('pointerdown', handlePointerDown);

  // Virtual keyboard focus preservation
  const handleVKToggled = () => {
    const sink = mf.shadowRoot?.querySelector<HTMLElement>('.ML__keyboard-sink');
    if (sink && mf.hasFocus?.()) {
      sink.blur();
      sink.focus();
    }
  };

  const vk = typeof window !== 'undefined' ? (window as unknown as { mathVirtualKeyboard?: EventTarget }).mathVirtualKeyboard : undefined;
  vk?.addEventListener?.('virtual-keyboard-toggle', handleVKToggled);

  // Double '/' within 350 ms and Shift+Enter addRowAfter handler
  let lastSlashTimestamp = 0;

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      mf.executeCommand('addRowAfter');
      options?.onShiftEnter?.(mf);
      return;
    }

    if (event.key === '/') {
      const now = Date.now();
      if (now - lastSlashTimestamp < 350) {
        // Double '/' within 350 ms: expand all math tools (AC-T4)
        event.preventDefault();
        event.stopPropagation();
        lastSlashTimestamp = 0;
        options?.onDoubleSlash?.();
        return;
      }
      lastSlashTimestamp = now;
      if (options?.onSingleSlash) {
        event.preventDefault();
        event.stopPropagation();
        options.onSingleSlash();
        return;
      }
    } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      lastSlashTimestamp = 0;
    }
  };

  mf.addEventListener('keydown', handleKeyDown, true);

  return () => {
    mf.removeEventListener('pointerdown', handlePointerDown);
    vk?.removeEventListener?.('virtual-keyboard-toggle', handleVKToggled);
    mf.removeEventListener('keydown', handleKeyDown, true);
  };
}
