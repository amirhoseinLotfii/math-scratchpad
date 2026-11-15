import { describe, expect, it } from 'vitest';
import { shellCachesToDelete } from '../../../src/pwa/sw-shell-cleanup';

describe('service-worker shell cleanup', () => {
  it('keeps the active shell and any shell reported by a live client', () => {
    const names = ['ms-shell-a', 'ms-shell-b', 'ms-shell-c', 'ms-images-v1', 'other-cache'];
    expect(shellCachesToDelete(names, 'ms-shell-c', new Set(['a']), true)).toEqual(['ms-shell-b']);
  });

  it('keeps the previous shell until clients can report their version', () => {
    const names = ['ms-shell-a', 'ms-shell-b'];
    expect(shellCachesToDelete(names, 'ms-shell-b', new Set(), false)).toEqual([]);
  });
});
