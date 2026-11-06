import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('production legal page parity and small-screen reflow', () => {
  for (const file of ['privacy.html', 'terms.html']) {
    it(`${file} is kept in sync with its deployed public copy`, () => {
      const root = readFileSync(join(process.cwd(), file), 'utf8');
      const publicCopy = readFileSync(join(process.cwd(), 'public', file), 'utf8');
      expect(publicCopy).toBe(root);
      expect(publicCopy).toContain('overflow-wrap:anywhere');
      expect(publicCopy).toContain('word-break:break-word');
    });
  }
});
