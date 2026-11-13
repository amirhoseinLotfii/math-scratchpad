import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: '.', testMatch: ['layout.initial.spec.ts', 'menu.import-icon.spec.ts'],
  use: { baseURL: 'http://127.0.0.1:5194', launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync('/tmp/math-chromium') ? '/tmp/math-chromium' : undefined), args: ['--no-sandbox','--disable-gpu'] } },
  projects: [
    { name:'mobile-320', use:{...devices['Pixel 7'],viewport:{width:320,height:640}} },
    { name:'pixel-7', use:{...devices['Pixel 7']} },
    { name:'desktop', use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900}} },
  ],
  webServer: { command:'npm run dev -- --host 127.0.0.1 --port 5194', cwd:fileURLToPath(new URL('../..',import.meta.url)), url:'http://127.0.0.1:5194/', reuseExistingServer:false },
});
