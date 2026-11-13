import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
export default defineConfig({ plugins: [cloudflareTest({ wrangler: { configPath: 'worker/wrangler.jsonc' } })], test: { include: ['worker/test/audit/*.test.ts'], maxWorkers: 1, testTimeout: 15000 } });
