import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
export default defineConfig({
  testDir: '.', testMatch: 'standalone.start.spec.ts',
  use: { baseURL: 'http://127.0.0.1:5193', launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync('/tmp/math-chromium') ? '/tmp/math-chromium' : undefined), args: ['--no-sandbox','--disable-gpu'] } },
  webServer: { command: 'python3 -m http.server 5193 --bind 127.0.0.1 --directory ../../dist', url: 'http://127.0.0.1:5193/standalone.html', reuseExistingServer: false },
});
