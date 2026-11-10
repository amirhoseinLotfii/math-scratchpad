import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyThemePreference, initializeThemePreference, readThemePreference, THEME_STORAGE_KEY, writeThemePreference } from '../../src/shared/lib/ui-prefs';

describe('theme preference', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('defaults to dark unless a valid saved choice exists', () => {
    expect(readThemePreference()).toBe('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(readThemePreference()).toBe('light');
    localStorage.setItem(THEME_STORAGE_KEY, 'invalid');
    expect(readThemePreference()).toBe('dark');
  });

  it('persists and applies the selected theme', () => {
    expect(writeThemePreference('light')).toBe(true);
    applyThemePreference('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('restores the saved theme before the app mounts', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    initializeThemePreference();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
