import { expect, test } from '@playwright/test';

test('first online visit prepares the shell, math editor and deep links for offline launch', async ({ context, page }, info) => {
  const failedRequests: string[] = [];
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).origin === 'http://127.0.0.1:4173') failedRequests.push(request.url());
  });
  await context.route('https://**/*', (route) => route.abort());
  await page.goto('./');
  const step = page.getByRole('button', { name: 'Step 1', exact: true });
  await expect(step).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const paths = await page.evaluate(async () => {
    const name = (await caches.keys()).find((key) => key.startsWith('ms-shell-'))!;
    return (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname);
  });
  expect(paths).toContain('/math-scratchpad/index.html');
  expect(paths.some((path) => path.endsWith('.woff2'))).toBe(true);
  expect(paths.some((path) => /vazirmatn-.*\.woff$/.test(path))).toBe(true);
  expect(paths.some((path) => path.endsWith('version.json'))).toBe(false);
  await context.setOffline(true);
  failedRequests.length = 0;
  await page.reload();
  const field = page.locator('math-field[aria-label="Step 1 expression"]');
  await expect(field).toBeVisible();
  await field.click();
  await page.keyboard.type('52');
  await expect.poll(() => field.evaluate((element) => (element as HTMLElement & { value: string }).value)).toContain('52');
  await page.screenshot({ path: info.outputPath('offline-editor.png') });
  await page.goto('./?from=offline');
  await expect(step).toBeVisible();
  await page.goto('./unknown/path');
  await expect(step).toBeVisible();
  expect(failedRequests).toEqual([]);
});
