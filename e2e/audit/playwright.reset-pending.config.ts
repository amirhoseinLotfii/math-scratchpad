import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['reset-pending-local-mode.spec.ts'],
  timeout: 45_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: 'http://127.0.0.1:5195',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        || (existsSync('/tmp/math-chromium') ? '/tmp/math-chromium' : undefined),
      args: ['--no-sandbox', '--disable-gpu'],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile-390', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'laptop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5195',
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    url: 'http://127.0.0.1:5195/',
    reuseExistingServer: !process.env.CI,
  },
});
