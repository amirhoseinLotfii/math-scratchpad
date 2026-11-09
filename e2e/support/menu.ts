import { expect, type Page } from '@playwright/test';

/**
 * Opens the app's responsive nested menu using the interaction supported by
 * the current viewport: keyboard disclosure on phones, hover flyout on wide
 * layouts. The helper asserts the correct accessible container is exposed.
 */
export async function openMenuSubmenu(page: Page, label: string) {
  const trigger = page.getByRole('menuitem', { name: label, exact: true });
  if ((page.viewportSize()?.width ?? 0) < 600) {
    await trigger.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('group', { name: `${label} actions` })).toBeVisible();
  } else {
    await trigger.hover();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('menu', { name: `${label} actions` })).toBeVisible();
  }
  return trigger;
}
