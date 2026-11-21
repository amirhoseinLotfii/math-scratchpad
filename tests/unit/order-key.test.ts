import { describe, expect, it } from 'vitest';
import { compareOrderKeys, generateOrderKey, rebalanceOrderKeys } from '../../src/features/math-editor/model/order-key';

describe('orderKey generation and midpoint insertion', () => {
  it('generates initial key a0', () => {
    expect(generateOrderKey()).toBe('a0');
  });

  it('increments sequential keys a0, a1, a2', () => {
    const k0 = generateOrderKey();
    const k1 = generateOrderKey(k0);
    const k2 = generateOrderKey(k1);
    expect(k0).toBe('a0');
    expect(k1).toBe('a1');
    expect(k2).toBe('a2');
    expect(compareOrderKeys(k0, k1)).toBe(-1);
    expect(compareOrderKeys(k1, k2)).toBe(-1);
  });

  it('generates a midpoint between a0 and a1', () => {
    const mid = generateOrderKey('a0', 'a1');
    expect(mid > 'a0').toBe(true);
    expect(mid < 'a1').toBe(true);
  });

  it('supports 500 repeated midpoint insertions while maintaining strict order (UT-03)', () => {
    let prev = 'a0';
    const next = 'a1';
    const insertedKeys: string[] = [];

    for (let i = 0; i < 500; i++) {
      const mid = generateOrderKey(prev, next);
      expect(mid > prev).toBe(true);
      expect(mid < next).toBe(true);
      insertedKeys.push(mid);
      prev = mid;
    }

    // Verify all keys are strictly sorted
    for (let i = 0; i < insertedKeys.length - 1; i++) {
      expect(insertedKeys[i] < insertedKeys[i + 1]).toBe(true);
    }
  });

  it('rebalances order keys evenly', () => {
    const keys = rebalanceOrderKeys(5);
    expect(keys).toEqual(['a0', 'a1', 'a2', 'a3', 'a4']);
  });
});
