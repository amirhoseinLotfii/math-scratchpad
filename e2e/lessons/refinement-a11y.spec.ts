import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../support/test';

test('Learn choice, math keyboard, and skip dialog have no automated WCAG A/AA violations', { tag: '@only-mobile-390' }, async ({ page }, info) => {

  for (const state of ['choice', 'math', 'skip'] as const) {
    await page.goto(`/e2e/fixtures/lesson-preview.html?view=${state === 'skip' ? 'text' : state}`);
    if (state === 'math') {
      const editor = page.getByRole('region', { name: 'Math answer for SAMPLE-1.1-L02' });
      await expect(editor.getByRole('button', { name: 'Show Keyboard' })).toHaveAttribute('aria-expanded', 'false');
      await editor.getByRole('button', { name: 'Show Keyboard' }).click();
      await expect(editor.getByRole('group', { name: 'Numeric keys' })).toBeVisible();
    } else if (state === 'skip') {
      await page.getByRole('button', { name: 'Skip check' }).click();
      await page.getByRole('dialog', { name: 'Skip this check?' }).waitFor();
    }

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    await info.attach(`learn-axe-${state}`, { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
    expect(results.violations, `${state} should have no automated WCAG A/AA violations`).toEqual([]);
  }
});
