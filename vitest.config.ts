import { defineConfig } from 'vitest/config';
import { createHash } from 'crypto';

// Global crypto mock for Node.js environment
if (typeof global.crypto === 'undefined') {
  global.crypto = {
    subtle: {
      digest: async (algorithm: string, data: ArrayBuffer) => {
        const hash = createHash(algorithm.toLowerCase().replace('-', ''));
        hash.update(Buffer.from(data));
        return new Uint8Array(hash.digest());
      }
    }
  } as any;
}

export default defineConfig({ test: {
 environment: 'jsdom',
 setupFiles: ['tests/support/setup.ts'],
 include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
 maxWorkers: 2,
 coverage: { provider: 'v8', reportOnFailure: true, reporter: ['text', 'json-summary'], include: ['src/**/*.ts', 'src/**/*.tsx'] },
 globals: true
} });
