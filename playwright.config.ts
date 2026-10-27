import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
 testDir: './e2e',
 outputDir: 'test-results/browser-artifacts',
 updateSnapshots: 'none',
 reporter: [['list'], ['json', { outputFile: 'test-results/playwright.json' }]],
 use: { baseURL: 'http://127.0.0.1:5173', launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync('/tmp/math-chromium') ? '/tmp/math-chromium' : undefined), args: ['--no-sandbox', '--disable-gpu'] }, trace: 'retain-on-failure', screenshot: 'only-on-failure', colorScheme: 'dark', locale: 'en-GB' },
 webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
 projects: [320, 390, 430].map(width => ({ name: `mobile-${width}`, use: { ...devices['Pixel 7'], viewport: { width, height: 844 } } })),
});
