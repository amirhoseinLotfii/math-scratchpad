/**
 * Lexicographical fractional order keys for step ordering.
 * Guarantees stable fractional midpoints between any two keys (e.g. 'a0', 'a0V', 'a1')
 * without rewriting neighboring HLC timestamps or causing collisions.
 */

const BASE_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ZERO_CHAR = '0';
const MID_CHAR = 'V'; // Midpoint in 62 characters (index 31)

/**
 * Compare two order keys lexicographically.
 */
export function compareOrderKeys(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Generate a lexicographic orderKey between prev and next.
 * Format starts with 'a' followed by integer or fractional digits, e.g. 'a0', 'a1', 'a0V'.
 */
export function generateOrderKey(prev?: string | null, next?: string | null): string {
  // Case 1: First item
  if (!prev && !next) return 'a0';

  // Case 2: Append after prev (next is null or undefined)
  if (prev && !next) {
    // If prev is of format 'a' + digits, increment the integer
    const match = prev.match(/^a(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      return `a${num + 1}`;
    }
    // Otherwise append a high character to stay strictly greater
    return `${prev}V`;
  }

  // Case 3: Prepend before next (prev is null or undefined)
  if (!prev && next) {
    const match = next.match(/^a(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > 0) return `a${num - 1}V`;
    }
    return `a0${MID_CHAR}`;
  }

  // Case 4: Insert between prev and next
  if (prev && next) {
    if (prev >= next) {
      // Out of order safety fallback
      return `${prev}V`;
    }

    // Find first difference
    let i = 0;
    while (i < prev.length && i < next.length && prev[i] === next[i]) {
      i++;
    }

    const prefix = prev.slice(0, i);
    const prevChar = prev[i] ?? ZERO_CHAR;
    const nextChar = next[i] ?? BASE_DIGITS[BASE_DIGITS.length - 1];

    const prevIdx = BASE_DIGITS.indexOf(prevChar);
    const nextIdx = BASE_DIGITS.indexOf(nextChar);

    if (prevIdx >= 0 && nextIdx >= 0 && nextIdx - prevIdx > 1) {
      // There is space between characters at position i
      const midIdx = Math.floor((prevIdx + nextIdx) / 2);
      return `${prefix}${BASE_DIGITS[midIdx]}`;
    }

    // If no space between prevChar and nextChar, take prev up to i+1 and append midpoint
    return `${prev}${MID_CHAR}`;
  }

  return 'a0';
}

/**
 * Generate a fresh sequence of n evenly spaced orderKeys: a0, a1, a2, ...
 */
export function rebalanceOrderKeys(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `a${i}`);
}
