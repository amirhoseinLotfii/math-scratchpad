import { expect, test, type Page } from '@playwright/test';

const base = 'http://127.0.0.1:4173';

async function openBuild(page: Page) {
  await page.goto('./');
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

async function requestUpdate(page: Page) {
  const chip = page.getByRole('button', { name: /وضعیت اتصال و آفلاین/ });
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((registration) => registration?.update()));
  await expect(chip).toContainText('نسخهٔ جدید');
  const dialog = page.getByRole('dialog', { name: 'وضعیت آفلاین و همگام‌سازی' });
  if (!(await dialog.isVisible())) await chip.click();
  await expect(dialog.getByText('نسخهٔ جدید آماده است', { exact: true })).toBeVisible();
  return { chip, dialog };
}

test.afterEach(async ({ request }) => {
  await request.post(`${base}/__switch?to=a`);
  await request.post(`${base}/__control`);
});

test('flushes pending work before updating and keeps A cached for another open A tab', async ({ context, page }) => {
  await context.route('https://**/*', (route) => route.abort());
  await openBuild(page);
  const initialDialog = page.getByRole('dialog', { name: 'وضعیت آفلاین و همگام‌سازی' });
  if (await initialDialog.isVisible()) await initialDialog.getByRole('button', { name: 'بستن' }).click();
  const field = page.locator('math-field').first();
  await field.click();
  await page.keyboard.type('8');
  await expect.poll(() => field.evaluate((element) => (element as HTMLElement & { value: string }).value)).toContain('8');

  const secondTab = await context.newPage();
  await openBuild(secondTab);
  await page.bringToFront();
  const secondNavigations: string[] = [];
  const firstNavigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) firstNavigations.push(frame.url());
  });
  secondTab.on('framenavigated', (frame) => {
    if (frame === secondTab.mainFrame()) secondNavigations.push(frame.url());
  });
  await page.evaluate(() => fetch(`${location.origin}/__switch?to=b`, { method: 'POST' }));
  const { chip, dialog } = await requestUpdate(page);
  const secondTabChip = secondTab.getByRole('button', { name: /وضعیت اتصال و آفلاین/ });
  await expect(secondTabChip).toContainText('نسخهٔ جدید');
  const navigationsBeforeUpdate = firstNavigations.length;
  await dialog.getByRole('button', { name: 'بارگذاری دوباره' }).click({ noWaitAfter: true });

  await expect.poll(() => page.locator('#math-scratchpad-redux').getAttribute('data-app-build-sha')).toBe('offline-test-b');
  await expect
    .poll(() =>
      page
        .locator('math-field')
        .first()
        .evaluate((element) => (element as HTMLElement & { value: string }).value),
    )
    .toContain('8');
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes('ms-shell-offline-test-a'))).toBe(true);
  await page.waitForTimeout(700);
  expect(firstNavigations).toHaveLength(navigationsBeforeUpdate + 1);
  expect(secondNavigations).toHaveLength(0);
  await expect.poll(() => secondTab.locator('#math-scratchpad-redux').getAttribute('data-app-build-sha')).toBe('offline-test-a');

  await secondTab.reload();
  await expect.poll(() => secondTab.locator('#math-scratchpad-redux').getAttribute('data-app-build-sha')).toBe('offline-test-b');
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes('ms-shell-offline-test-a'))).toBe(false);
  await expect(chip).toBeVisible();
});

test('choosing later keeps build A interactive and does not trigger a reload', async ({ context, page }) => {
  await context.route('https://**/*', (route) => route.abort());
  await openBuild(page);
  const chip = page.getByRole('button', { name: /وضعیت اتصال و آفلاین/ });
  const field = page.locator('math-field').first();
  const navigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  await page.evaluate(() => fetch(`${location.origin}/__switch?to=b`, { method: 'POST' }));
  const { dialog } = await requestUpdate(page);
  const beforeLater = navigations.length;
  await dialog.getByRole('button', { name: 'بعداً' }).click();
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(400);
  expect(navigations).toHaveLength(beforeLater);

  await field.click();
  await page.keyboard.type('6');
  await expect.poll(() => field.evaluate((element) => (element as HTMLElement & { value: string }).value)).toContain('6');
  await expect(page.locator('#math-scratchpad-redux')).toHaveAttribute('data-app-build-sha', 'offline-test-a');
  await chip.click();
  await expect(chip).toContainText('نسخهٔ جدید');
});
