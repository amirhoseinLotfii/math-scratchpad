import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/persistence/offline-outbox.spec.ts', '**/persistence/legacy-migration.spec.ts'],
  outputDir: 'test-results/cross-browser-artifacts',
  reporter: [['list'], ['json', { outputFile: 'test-results/cross-browser.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    colorScheme: 'dark',
    locale: 'fa-IR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'firefox-mobile-390', grep: /@only-mobile-390/, use: { browserName: 'firefox', viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'firefox-desktop', grep: /@only-laptop-1440/, use: { browserName: 'firefox', viewport: { width: 1440, height: 900 } } },
    { name: 'webkit-mobile-390', grep: /@only-mobile-390/, use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'webkit-desktop', grep: /@only-laptop-1440/, use: { browserName: 'webkit', viewport: { width: 1440, height: 900 } } },
  ],
});
