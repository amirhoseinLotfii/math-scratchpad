import { afterEach, describe, expect, it, vi } from 'vitest';
import { uid } from '../../src/features/math-editor/model/model';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('math editor model IDs', () => {
  it('uses the documented time and random fallback when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {});
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    expect(uid()).toBe('m1700000000000-i');
  });
});
