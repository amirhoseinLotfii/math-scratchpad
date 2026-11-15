import { expect, test } from '@playwright/test';

test('standalone.loads-editor.with-external-network-blocked', async ({ page }) => {
  const externalResponses: string[] = [],
    pageErrors: string[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).hostname !== '127.0.0.1') externalResponses.push(response.url());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/*', (route) => (new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()));
  await page.goto('/standalone.html');
  await expect(page.getByRole('button', { name: 'Exercise menu' })).toBeVisible();
  const field = page.locator('math-field[aria-label="Step 1 expression"]');
  await field.evaluate((element) => {
    const input = element as HTMLElement & { value: string };
    input.value = '2468';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  });
  await expect.poll(() => field.evaluate((element) => (element as HTMLElement & { value: string }).value)).toBe('2468');
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.entries(localStorage).some(([key, value]) => key.startsWith('math-scratchpad-pending-draft-v1:') && value.includes('2468')),
      ),
    )
    .toBe(true);
  const embeddedFonts = await page.evaluate(async () => {
    const persian = document.createElement('p');
    persian.lang = 'fa';
    persian.textContent = 'تمرین ریاضی';
    document.querySelector('#math-scratchpad-redux')?.append(persian);
    const faces = await document.fonts.load('400 16px Vazirmatn', persian.textContent);
    const fontUrls = [...document.querySelectorAll('style')]
      .flatMap((style) => (style.textContent ?? '').match(/url\([^)]+\)/g) ?? [])
      .filter((url) => /font\/woff2?|\.woff2?\b/.test(url));
    return {
      family: getComputedStyle(persian).fontFamily,
      loaded: faces.some((face) => face.family === 'Vazirmatn' && face.status === 'loaded'),
      fontCount: fontUrls.length,
      allEmbedded: fontUrls.every((url) => url.startsWith('url(data:font/')),
    };
  });
  expect(embeddedFonts.family).toContain('Vazirmatn');
  expect(embeddedFonts.loaded).toBe(true);
  expect(embeddedFonts.fontCount).toBeGreaterThan(2);
  expect(embeddedFonts.allEmbedded).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Exercise menu' })).toBeVisible();
  await expect.poll(() => field.evaluate((element) => (element as HTMLElement & { value: string }).value)).toBe('2468');
  expect(pageErrors).toEqual([]);
  expect(externalResponses).toEqual([]);
});
