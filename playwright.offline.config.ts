import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/offline',
  testMatch: '*.offline.spec.ts',
  outputDir: 'test-results/offline',
  use: {
    baseURL: 'http://127.0.0.1:4173/math-scratchpad/',
    serviceWorkers: 'allow',
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync('/tmp/math-chromium') ? '/tmp/math-chromium' : undefined),
      args: ['--no-sandbox', '--disable-gpu'],
    },
  },
  projects: [
    { name: 'mobile-390', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'laptop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: process.env.PW_PREBUILT === '1' ? 'node scripts/serve-pages.mjs' : 'npm run build && node scripts/serve-pages.mjs',
    url: 'http://127.0.0.1:4173/math-scratchpad/',
    timeout: 120_000,
  },
});
