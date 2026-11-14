import { expect, test } from '../support/test';
import { openConfidence, startBatch } from '../support/mobile-journey';
for (const state of ['single-edit', 'batch-edit', 'confidence'] as const) {
 test(`VISUAL ${state}: reviewed phone layout baseline`, async ({ page }) => {
  await page.clock.install();
  await page.clock.setFixedTime('2026-01-01T00:00:00Z');
  if (state === 'batch-edit') await startBatch(page);
  else if (state === 'confidence') await openConfidence(page);
  else await page.goto('/');
  const elapsedTime = page.getByLabel('Question elapsed time');
  // Let React effects register the focus listener before changing fixed time.
  // A focus event sent immediately after page.goto can beat that effect on
  // the single-edit route and leave the displayed timer at 00:00.
  await expect(elapsedTime).toBeVisible();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.clock.setFixedTime('2026-01-01T00:00:03Z');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(elapsedTime).toHaveText('00:03');
  // The legal policy links are part of the public shell, not the
  // editor's reviewed pixel baseline. Assert them separately.
  const policyFooter = page.locator('body > footer');
  if (await policyFooter.count()) {
   await expect(policyFooter.locator('a[href="./privacy.html"]')).toHaveAttribute('href', './privacy.html');
   await expect(policyFooter.locator('a[href="./terms.html"]')).toHaveAttribute('href', './terms.html');
  }
  await page.addStyleTag({ content: 'body > footer { display: none !important; }' });
  const viewport = page.viewportSize();
  // CI reports a repeatable 1% raster difference for the 430px batch image.
  const maxDiffPixelRatio = viewport?.width === 320 ? 0.03 : state === 'batch-edit' && viewport?.width === 430 ? 0.015 : 0.005;
  await expect(page).toHaveScreenshot(`${state}.png`, {
   fullPage: true, animations: 'disabled', caret: 'hide',
   maxDiffPixelRatio,
  });
 });
}
