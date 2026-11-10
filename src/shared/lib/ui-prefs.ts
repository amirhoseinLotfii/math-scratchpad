import { useCallback, useState } from 'react';
import { getLearningStorage } from '../../sync/browser-db';
import { BREAKPOINT_MEDIA } from './breakpoints';
/** UI-only preferences (panel open/closed). Kept separate from the session draft so they never touch user work. */
export const UI_PREFS_PREFIX = 'math-scratchpad-ui-v1:';
export const THEME_STORAGE_KEY = UI_PREFS_PREFIX + 'theme';
export type ThemePreference = 'dark' | 'light';
export function readThemePreference(): ThemePreference {
  try { return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
}
export function writeThemePreference(theme: ThemePreference): boolean {
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); return true; } catch { return false; }
}
export function applyThemePreference(theme: ThemePreference): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme;
}
export function initializeThemePreference(): void { applyThemePreference(readThemePreference()); }
export type PanelKey = 'questions' | 'session-details';
/** Keys of removed panels; cleared once so they do not linger. */

// Retired keys are purged with older browser data after authenticated server bootstrap.
export function readPanelOpen(key: PanelKey, fallback: boolean): boolean {
  try { const v = getLearningStorage().getItem(UI_PREFS_PREFIX + key); return v === '1' ? true : v === '0' ? false : fallback; } catch { return fallback; }
}
export function writePanelOpen(key: PanelKey, open: boolean): boolean {
  try { getLearningStorage().setItem(UI_PREFS_PREFIX + key, open ? '1' : '0'); return true; } catch { return false; }
}
/** Open state that survives question navigation and reloads; storage failures fall back to in-memory state. */
export function usePanelOpen(key: PanelKey, fallback: boolean): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => readPanelOpen(key, fallback));
  const set = useCallback((value: boolean) => { setOpen(value); writePanelOpen(key, value); }, [key]);
  return [open, set];
}
const ASKED_PREFIX = UI_PREFS_PREFIX + 'wellbeing-asked:';
export function wellbeingAsked(sessionId: string): boolean { try { return getLearningStorage().getItem(ASKED_PREFIX + sessionId) === '1'; } catch { return false; } }
export function markWellbeingAsked(sessionId: string): void { try { getLearningStorage().setItem(ASKED_PREFIX + sessionId, '1'); } catch { /* in-memory only */ } }
/** Virtual keyboard: an explicit Show/Hide choice is remembered; otherwise it starts closed on fine-pointer wide screens. */
const KEYBOARD_KEY = UI_PREFS_PREFIX + 'virtual-keyboard';
export const DESKTOP_KEYBOARD_QUERY = BREAKPOINT_MEDIA.desktopKeyboard;
export function isDesktopPointer(): boolean { try { return typeof matchMedia === 'function' && matchMedia(DESKTOP_KEYBOARD_QUERY).matches; } catch { return false; } }
export function readKeyboardChoice(): boolean | null { try { const v = getLearningStorage().getItem(KEYBOARD_KEY); return v === '1' ? true : v === '0' ? false : null; } catch { return null; } }
export function writeKeyboardChoice(open: boolean): void { try { getLearningStorage().setItem(KEYBOARD_KEY, open ? '1' : '0'); } catch { /* in-memory only */ } }
export function initialKeyboardOpen(current: boolean): boolean { const c = readKeyboardChoice(); if (c !== null) return c; return isDesktopPointer() ? false : current; }
