import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const base = process.env.MATH_BASELINE_URL ?? 'http://127.0.0.1:5187/math-scratchpad/';
const origin = new URL(base).origin;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route('**/*', (route) => (new URL(route.request().url()).origin === origin ? route.continue() : route.abort()));
  const page = await context.newPage();
  const network: Array<{ url: string; status?: number; type: string; bytes?: number; failure?: string }> = [];
  page.on('response', (response) => {
    network.push({
      url: response.url(),
      type: response.request().resourceType(),
      status: response.status(),
      bytes: Number(response.headers()['content-length']) || undefined,
    });
  });
  page.on('requestfailed', (request) => {
    network.push({ url: request.url(), type: request.resourceType(), failure: request.failure()?.errorText });
  });
  await page.goto(base);
  const step = page.locator('math-field[aria-label="Step 1 expression"]');
  await step.waitFor();
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
  await context.setOffline(true);
  await step.evaluate((element) => {
    const field = element as HTMLElement & { value: string };
    field.value = '2468';
    field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  });
  const draftRecorded = await page.evaluate(() =>
    Object.entries(localStorage).some(([key, value]) => key.startsWith('math-scratchpad-pending-draft-v1:') && value.includes('2468')),
  );
  assert.equal(draftRecorded, true);
  await assert.rejects(page.reload(), /INTERNET_DISCONNECTED/);
  await context.setOffline(false);
  await page.goto(base);
  await step.waitFor();
  assert.equal(await step.evaluate((element) => (element as HTMLElement & { value: string }).value), '2468');
  console.log(JSON.stringify(network, null, 2));
} finally {
  await browser.close();
}
