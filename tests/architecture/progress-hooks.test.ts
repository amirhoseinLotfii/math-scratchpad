// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('exposes reading-position restoration through the context without the obsolete hooks', () => {
  const exports = readFileSync('src/features/progress/index.ts', 'utf8');
  expect(exports).not.toContain("'./use-reading-position'");
  expect(exports).toContain('useReadingPositionContext');
});
