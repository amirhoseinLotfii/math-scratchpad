import { describe, expect, it } from 'vitest';
import { isLearningStorageKey } from '../../src/sync/browser-db';

describe('isLearningStorageKey', () => {
  it('accepts session keys and lesson-progress prefixes', () => {
    expect(isLearningStorageKey('math-scratchpad-session-v3')).toBe(true);
    expect(isLearningStorageKey('math-scratchpad-lesson-progress-v1:bank:1')).toBe(true);
  });

  it('syncs last-open-lesson and reading-position versioned keys', () => {
    expect(isLearningStorageKey('math-scratchpad-last-open-lesson-v1:bank%3A1:v2')).toBe(true);
    expect(isLearningStorageKey('math-scratchpad-reading-position-v1')).toBe(true);
    expect(isLearningStorageKey('math-scratchpad-reading-position-v1:device')).toBe(true);
  });

  it('rejects unrelated keys', () => {
    expect(isLearningStorageKey('math-scratchpad-drive-bank-cache-v1:x')).toBe(false);
    expect(isLearningStorageKey('unrelated')).toBe(false);
  });
});
