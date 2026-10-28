import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPersistentStore, SESSION_KEY } from '../../src/features/session/persistence/persistent-store';
import { initialState } from '../../src/store';
import { DESKTOP_KEYBOARD_QUERY, UI_PREFS_PREFIX, initialKeyboardOpen, writeKeyboardChoice } from '../../src/shared/lib/ui-prefs';
const runtimes: ReturnType<typeof createPersistentStore>[] = [];
function screen(desktop: boolean) { vi.stubGlobal('matchMedia', vi.fn((q: string) => ({ matches: q === DESKTOP_KEYBOARD_QUERY ? desktop : !desktop }))); }
function mount() { const r = createPersistentStore(); runtimes.push(r); return r.store.getState().keyboardOpen; }
function seedOpen() { const s = initialState(); localStorage.setItem(SESSION_KEY, JSON.stringify({ version: 3, state: { session: { doc: s.doc, prefs: s.prefs, keyboardOpen: true }, sync: { revision: 1, writerId: 'w' } } })); }
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { for (const r of runtimes.splice(0)) r.dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('virtual keyboard default (item 13)', () => {
  it('starts closed on a fine-pointer wide screen, fresh install', () => { screen(true); expect(mount()).toBe(false); });
  it('starts closed on desktop even if an old draft saved it open', () => { screen(true); seedOpen(); expect(mount()).toBe(false); });
  it('keeps the current mobile default (open)', () => { screen(false); expect(mount()).toBe(true); });
  it('keeps a saved open state on mobile', () => { screen(false); seedOpen(); expect(mount()).toBe(true); });
  it('remembers an explicit Show on desktop across reloads', () => { screen(true); writeKeyboardChoice(true); expect(localStorage.getItem(UI_PREFS_PREFIX + 'virtual-keyboard')).toBe('1'); expect(mount()).toBe(true); });
  it('remembers an explicit Hide on mobile', () => { screen(false); writeKeyboardChoice(false); expect(mount()).toBe(false); });
  it('bank loads respect the desktop default and explicit choice', () => { screen(true); expect(initialKeyboardOpen(true)).toBe(false); writeKeyboardChoice(true); expect(initialKeyboardOpen(true)).toBe(true); });
  it('falls back safely when matchMedia is missing', () => { vi.stubGlobal('matchMedia', undefined); expect(initialKeyboardOpen(true)).toBe(true); });
});
