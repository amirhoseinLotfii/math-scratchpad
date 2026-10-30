import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
 testDir: './e2e',
 outputDir: 'test-results/browser-artifacts',
 updateSnapshots: 'none',
 reporter: [['list'], ['json', { outputFile: 'test-results/playwright.json' }]],
 use: { baseURL: 'http://127.0.0.1:5173', launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync('/tmp/math-chromium') ? '/tmp/math-chromium' : undefined), args: ['--no-sandbox', '--disable-gpu'] }, trace: 'retain-on-failure', screenshot: 'only-on-failure', colorScheme: 'dark', locale: 'en-GB' },
 webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
 projects: [
  ...[320, 390, 430].map(width => ({ name: `mobile-${width}`, testIgnore: '**/wide/**', use: { ...devices['Pixel 7'], viewport: { width, height: 844 } } })),
 ...[{name:'laptop-1024',width:1024,height:768},{name:'laptop-1440',width:1440,height:900},{name:'desktop-1920',width:1920,height:1080},{name:'desktop-2560',width:2560,height:1440}].map(({name,width,height})=>({name,testMatch:['**/wide/**/*.spec.ts','**/accessibility/axe-states.spec.ts','**/persistence/**/*.spec.ts',...(name==='laptop-1440'?['**/lessons/phase5-visual.spec.ts','**/lessons/phase5-keyboard.spec.ts']:[])],use:{...devices['Desktop Chrome'],viewport:{width,height}}})),
 ],
});
