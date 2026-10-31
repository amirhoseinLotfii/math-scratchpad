import { expect, test } from '@playwright/test';

test('desktop lesson reference is paged and readable, checks accept answers, and illustrations load', async ({ page }) => {
  await page.goto('/e2e/fixtures/lesson-connected-preview.html?image=1&no-wellbeing=1&bidi=1');
  await expect(page.getByText('Sample practice 1.')).toBeVisible();

  const lessonButton = page.getByRole('button', { name: 'Lesson' });
  await lessonButton.click();
  const reference = page.getByRole('dialog', { name: /توابع و تابع‌نما/ });
  await expect(reference.getByRole('heading', { name: 'تعریف تابع' })).toBeVisible();
  const illustration = reference.getByRole('img', { name: 'تصویر نمونهٔ درس برای آزمون نمایش شکل.' });
  await expect(illustration).toBeVisible();
  await expect.poll(() => illustration.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(reference.getByText('توضیح فارسیِ تصویر نمونه.')).toBeVisible();
  await expect(reference.getByRole('radio')).toHaveCount(0);
  await expect(reference.getByRole('button', { name: /بخش بعدی/ })).toBeVisible();
  await reference.getByRole('button', { name: /بخش بعدی/ }).click();
  await expect(reference.getByRole('heading', { name: 'Another sample concept' })).toBeVisible();
  await expect(reference.getByRole('button', { name: /بخش قبلی/ })).toBeEnabled();
  await reference.getByRole('button', { name: /بازگشت به سؤال/ }).click();
  await expect(lessonButton).toBeFocused();

  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Lessons' }).click();
  await page.getByRole('dialog', { name: 'درس‌ها' }).getByRole('button', { name: /توابع و تابع‌نما/ }).click();
  const interactive = page.getByRole('region', { name: 'درس‌نامه' });
  await expect(interactive).toHaveAttribute('lang', 'fa');
  await expect(interactive).toHaveAttribute('dir', 'rtl');
  await expect(interactive.getByRole('heading', { name: 'تعریف تابع' })).toBeVisible();
  await interactive.getByRole('radio', { name: 'Option B' }).check();
  await interactive.getByRole('radio', { name: /میزان اطمینان ۴/ }).check();
  await expect(interactive.getByRole('button', { name: /بخش بعدی/ })).toBeEnabled();
  await interactive.getByRole('button', { name: /بخش بعدی/ }).click();
  await expect(interactive.getByRole('heading', { name: 'Another sample concept' })).toBeVisible();
  const answer = interactive.getByRole('region', { name: 'پاسخ ریاضی برای SAMPLE-1.1-L02' });
  const field = answer.locator('math-field[aria-label="عبارت گام ۱"]');
  await expect(field).toBeVisible();
  await answer.getByRole('button', { name: 'بازکردن صفحه‌کلید' }).click();
  await answer.getByRole('group', { name: 'Numeric keys' }).getByRole('button', { name: '8', exact: true }).click();
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & { value: string }).value)).toBe('8');
  await expect(interactive.getByRole('button', { name: /بخش قبلی/ })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
