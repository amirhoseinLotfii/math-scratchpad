import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [cloudflareTest({
    wrangler: { configPath: 'worker/wrangler.jsonc' },
    // Enabled only inside the isolated local Worker test environment. The
    // production and staging Wrangler configurations deliberately omit it.
    miniflare: { bindings: { EVENT_RATE_LIMIT: '5', SCOPED_RESET_ENABLED: 'true' } },
  })],
  test: {
    include: ['worker/tests/**/*.test.ts'],
    maxWorkers: 1,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
