const sharedKeys = new Set([
  'math-scratchpad-session-v3',
  'math-scratchpad-redux-v2',
  'math-scratchpad-flow-v1',
  'math-scratchpad-drive-session-archive-v1',
  'math-scratchpad-reading-position-v1',
]);
const sharedPrefixes = ['math-scratchpad-lesson-progress-v1:', 'math-scratchpad-last-open-lesson-v1:'];
const browserOnlyPrefixes = ['math-scratchpad-reading-position-v1:'];
const browserOnlyKeys = new Set(['math-scratchpad-inline-fractions-round1-v1']);

export function isScopedResetSharedStateKey(key: string): boolean {
  return sharedKeys.has(key) || sharedPrefixes.some((prefix) => key.startsWith(prefix));
}

export function isLearningStorageKey(key: string): boolean {
  return isScopedResetSharedStateKey(key) || browserOnlyKeys.has(key) || browserOnlyPrefixes.some((prefix) => key.startsWith(prefix));
}
