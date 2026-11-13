import { expect, test } from '@playwright/test';
for (const [name, payload] of [
  ['invalid', '{bad json'],
  ['oversized', 'x'.repeat(1_000_001)],
  ['script', '{"version":2,"doc":{"value":"<script>window.__auditXss=1</script>"}}'],
] as const) {
  test(`import.invalid.${name}.shows-error-without-script-execution`, async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto('/');
    await page.getByRole('button', { name: 'Exercise menu' }).click();
    await page.getByRole('menuitem', { name: 'Show more' }).click();
    await page.getByRole('menuitem', { name: 'Data', exact: true }).hover();
    await page.getByRole('menuitem', { name: 'Import session JSON' }).click();
    const panel = page.getByRole('region',{name:'Session backup'});
    await panel.getByRole('textbox',{name:'Copy or paste session JSON'}).fill(payload);
    await panel.getByRole('button',{name:'Restore'}).click();
    await expect(panel.getByRole('alert')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as {__auditXss?:number}).__auditXss)).toBeUndefined();
  });
}
