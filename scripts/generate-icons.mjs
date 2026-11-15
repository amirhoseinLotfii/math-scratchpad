import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const favicon = await readFile('public/favicon.svg', 'utf8');
const url = 'data:image/svg+xml;base64,' + Buffer.from(favicon).toString('base64');
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? (existsSync('/tmp/math-chromium') ? '/tmp/math-chromium' : undefined),
});
try {
  await mkdir('public/icons', { recursive: true });
  for (const [size, name, maskable] of [
    [192, 'icon-192', false],
    [512, 'icon-512', false],
    [512, 'icon-maskable-512', true],
    [180, 'apple-touch-icon-180', false],
  ]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const background = maskable ? '#151719' : 'transparent';
    const iconSize = maskable ? Math.round(size * 0.59) : size;
    await page.setContent(
      '<style>html,body{margin:0;width:100%;height:100%}' +
        `body{display:grid;place-items:center;background:${background}}</style>` +
        `<img alt="" width="${iconSize}" height="${iconSize}" src="${url}">`,
    );
    await page.locator('img').evaluate((image) => image.decode());
    await page.screenshot({ path: `public/icons/${name}.png`, omitBackground: !maskable });
    await page.close();
  }
} finally {
  await browser.close();
}
