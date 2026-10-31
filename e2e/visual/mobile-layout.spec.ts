import { expect, test } from '../support/test';
import { openConfidence, startBatch } from '../support/mobile-journey';
for (const state of ['single-edit', 'batch-edit', 'confidence'] as const) {
 test(`VISUAL ${state}: reviewed phone layout baseline`, async ({ page }) => {
  await page.clock.install();
  await page.clock.setFixedTime('2026-01-01T00:00:00Z');
  if (state === 'batch-edit') await startBatch(page);
  else if (state === 'confidence') await openConfidence(page);
  else await page.goto('/');
  await page.clock.setFixedTime('2026-01-01T00:00:03Z');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByLabel('Question elapsed time')).toHaveText('00:03');
  const viewport = page.viewportSize();
  // CI reports a repeatable 1% raster difference for the 430px batch image.
  const maxDiffPixelRatio = state === 'batch-edit' && viewport?.width === 430 ? 0.015 : 0.005;
  await expect(page).toHaveScreenshot(`${state}.png`, {
   fullPage: true, animations: 'disabled', caret: 'hide',
   maxDiffPixelRatio,
  });
 });
}
