import { expect, test } from '../support/test';
import { openConfidence, startBatch } from '../support/mobile-journey';
for (const state of ['single-edit', 'batch-edit', 'confidence'] as const) {
 test(`VISUAL ${state}: reviewed phone layout baseline`, async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  if (state === 'batch-edit') await startBatch(page);
  else if (state === 'confidence') await openConfidence(page);
  else await page.goto('/');
  await page.clock.runFor(3000);
  await expect(page).toHaveScreenshot(`${state}.png`, {
   fullPage: true, animations: 'disabled', caret: 'hide',
   maxDiffPixelRatio: 0.005,
  });
 });
}
