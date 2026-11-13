import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: '.',
  testMatch: ['import.requires-confirmation.spec.ts', 'import.file-confirmation.spec.ts', 'import.invalid-inputs.spec.ts'],
  use: {
    baseURL: 'http://127.0.0.1:5194',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync('/tmp/math-chromium') ? '/tmp/math-chromium' : undefined),
      args: ['--no-sandbox', '--disable-gpu'],
    },
  },
  projects: [
    { name: 'mobile-390', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5194',
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    url: 'http://127.0.0.1:5194/',
    reuseExistingServer: false,
  },
});
