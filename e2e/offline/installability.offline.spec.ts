import { expect, test } from '@playwright/test';

test('the prefixed production build is installable and all manifest icons load', async ({ context, page, request }) => {
  await context.route('https://**/*', (route) => route.abort());
  await page.goto('./');
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const manifestResponse = await request.get('./manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({
    name: 'Math Scratchpad',
    short_name: 'Math Pad',
    id: './',
    scope: './',
    start_url: './?source=pwa',
    display: 'standalone',
    theme_color: '#151719',
    background_color: '#151719',
  });
  expect(manifest.icons).toEqual([
    { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: './icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ]);
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  const cdp = await context.newCDPSession(page);
  await expect.poll(async () => (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([]);
});
