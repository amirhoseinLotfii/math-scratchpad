import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [cloudflareTest({
    wrangler: { configPath: 'worker/wrangler.jsonc' },
    miniflare: { bindings: { EVENT_RATE_LIMIT: '5' } },
  })],
  test: {
    include: ['worker/tests/**/*.test.ts'],
    maxWorkers: 1,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
