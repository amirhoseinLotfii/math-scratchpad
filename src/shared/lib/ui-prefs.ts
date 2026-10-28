import { useCallback, useState } from 'react';
/** UI-only preferences (panel open/closed). Kept separate from the session draft so they never touch user work. */
export const UI_PREFS_PREFIX = 'math-scratchpad-ui-v1:';
export type PanelKey = 'questions' | 'session-details';
/** Keys of removed panels; cleared once so they do not linger. */
const RETIRED = ['shortcuts'];
try { for (const k of RETIRED) localStorage.removeItem(UI_PREFS_PREFIX + k); } catch { /* storage unavailable */ }
export function readPanelOpen(key: PanelKey, fallback: boolean): boolean {
  try { const v = localStorage.getItem(UI_PREFS_PREFIX + key); return v === '1' ? true : v === '0' ? false : fallback; } catch { return fallback; }
}
export function writePanelOpen(key: PanelKey, open: boolean): boolean {
  try { localStorage.setItem(UI_PREFS_PREFIX + key, open ? '1' : '0'); return true; } catch { return false; }
}
/** Open state that survives question navigation and reloads; storage failures fall back to in-memory state. */
export function usePanelOpen(key: PanelKey, fallback: boolean): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => readPanelOpen(key, fallback));
  const set = useCallback((value: boolean) => { setOpen(value); writePanelOpen(key, value); }, [key]);
  return [open, set];
}
const ASKED_PREFIX = UI_PREFS_PREFIX + 'wellbeing-asked:';
export function wellbeingAsked(sessionId: string): boolean { try { return localStorage.getItem(ASKED_PREFIX + sessionId) === '1'; } catch { return false; } }
export function markWellbeingAsked(sessionId: string): void { try { localStorage.setItem(ASKED_PREFIX + sessionId, '1'); } catch { /* in-memory only */ } }
/** Virtual keyboard: an explicit Show/Hide choice is remembered; otherwise it starts closed on fine-pointer wide screens. */
const KEYBOARD_KEY = UI_PREFS_PREFIX + 'virtual-keyboard';
export const DESKTOP_KEYBOARD_QUERY = '(pointer: fine) and (min-width: 1024px)';
export function isDesktopPointer(): boolean { try { return typeof matchMedia === 'function' && matchMedia(DESKTOP_KEYBOARD_QUERY).matches; } catch { return false; } }
export function readKeyboardChoice(): boolean | null { try { const v = localStorage.getItem(KEYBOARD_KEY); return v === '1' ? true : v === '0' ? false : null; } catch { return null; } }
export function writeKeyboardChoice(open: boolean): void { try { localStorage.setItem(KEYBOARD_KEY, open ? '1' : '0'); } catch { /* in-memory only */ } }
export function initialKeyboardOpen(current: boolean): boolean { const c = readKeyboardChoice(); if (c !== null) return c; return isDesktopPointer() ? false : current; }
