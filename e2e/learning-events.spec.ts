import { expect, test } from '@playwright/test';

test('a learner step-editor action reaches the validated event stream', async ({ page }) => {
  await page.goto('/e2e/fixtures/learn-events-preview.html');
  const probe = page.getByTestId('learn-event-probe');
  await expect(page.getByRole('button', { name: 'Add step' })).toBeVisible();
  await page.getByRole('button', { name: 'Add step' }).click();
  await expect.poll(async () => JSON.parse(await probe.textContent() || '[]').some((event: { type: string }) => event.type === 'step_added')).toBe(true);
  await expect.poll(async () => JSON.parse(await probe.textContent() || '[]').some((event: { type: string }) => event.type === 'step_open')).toBe(true);
  const events = JSON.parse(await probe.textContent() || '[]') as Array<{ type: string; itemId?: string; steps?: string[] }>;
  const step = events.find(event => event.type === 'step_added');
  expect(step?.itemId).toBeTruthy();
  expect(step?.steps?.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(async () => JSON.parse(await probe.textContent() || '[]').some((event: { type: string; itemId?: string }) => event.type === 'step_close' && event.itemId === step?.itemId)).toBe(true);
});
