import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  plugins: [cloudflareTest({
    wrangler: { configPath: 'worker/wrangler.jsonc' },
    // Synthetic local-only enablement; never copied to Worker deployment vars.
    miniflare: { bindings: { SCOPED_RESET_ENABLED: 'true' } },
  })],
  test: { include: ['worker/test/audit/*.test.ts'], maxWorkers: 1, testTimeout: 15_000 },
});
