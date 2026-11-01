import { readFile } from 'node:fs/promises';
import { clickMathKeys, dismissWellbeing, expect, mathValue, test } from '../support/test';

async function openActiveLesson(page: import('@playwright/test').Page) {
  await page.goto('/e2e/fixtures/active-lesson-preview.html');
  await dismissWellbeing(page);
  await page.getByRole('button', { name: 'Exercise menu' }).click();
  await page.getByRole('menuitem', { name: 'Lessons' }).click();
  const picker = page.getByRole('dialog', { name: 'درس‌ها' });
  await picker.getByRole('button', { name: /توابع.*شروع‌نشده/ }).click();
  return page.locator('.lesson-active-flow');
}

async function submitChunk(page: import('@playwright/test').Page, flow: import('@playwright/test').Locator, answer: string, nextLabel: RegExp) {
  const workTab = flow.getByRole('tab', { name: /پاسخ‌نویسی/ });
  if (await workTab.count()) await workTab.click();
  const workPane = flow.getByRole('complementary', { name: 'پاسخ‌نویسی همین بخش' });
  const answerBox = workPane.getByLabel('پاسخ تو');
  await answerBox.fill(answer);
  await workPane.getByRole('button', { name: 'ثبت پاسخ' }).click();
  if (await flow.getByRole('tab', { name: 'درس‌نامه' }).count()) await flow.getByRole('tab', { name: 'درس‌نامه' }).click();
  const next = flow.getByRole('button', { name: nextLabel });
  await expect(next).toBeEnabled();
  await next.click();
}

test('typed chunk answers gate each next step at mobile 390 and desktop sizes', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  if (!['mobile-390', 'desktop-1280-active', 'laptop-1440'].includes(project)) test.skip();
  const viewport = project === 'mobile-390' ? { width: 390, height: 844 }
    : project === 'desktop-1280-active' ? { width: 1280, height: 900 }
      : { width: 1440, height: 900 };
  await page.setViewportSize(viewport);
  const flow = await openActiveLesson(page);
  await expect(flow).toHaveAttribute('dir', 'rtl');
  if (project === 'mobile-390') {
    const headerBoxes = await flow.evaluate(element => {
      const box = (selector: string) => {
        const rect = element.querySelector(selector)!.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
      };
      return { back: box('.lesson-back'), info: box('.lesson-info-toggle'), exports: box('.lesson-download-controls') };
    });
    const overlap = (a: typeof headerBoxes.back, b: typeof headerBoxes.info) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    expect(overlap(headerBoxes.back, headerBoxes.info)).toBe(false);
    expect(headerBoxes.exports.top).toBeGreaterThanOrEqual(Math.max(headerBoxes.back.bottom, headerBoxes.info.bottom));
  }
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  const firstNext = flow.getByRole('button', { name: /گام بعدی/ });
  await expect(firstNext).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath(`active-lesson-${project}-reading.png`), fullPage: true });

  await submitChunk(page, flow, 'پاسخ من: دامنه را از مؤلفه‌های اول می‌نویسم.', /گام بعدی/);
  await expect(flow.getByRole('heading', { name: 'تشخیص تابع' })).toBeVisible();
  const secondNext = flow.getByRole('button', { name: /رفتن به مثال‌ها/ });
  await expect(secondNext).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath(`active-lesson-${project}-chunk-2.png`), fullPage: true });
  await submitChunk(page, flow, 'پاسخ من: هر ورودی فقط یک خروجی دارد.', /رفتن به مثال‌ها/);
  await expect(flow.getByRole('heading', { name: 'رابطه و تابع' })).toBeVisible();
  await expect(flow.getByRole('button', { name: /مقایسه با حل درس‌نامه/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath(`active-lesson-${project}-solve.png`), fullPage: true });
});

test('example solution waits for learner work and lesson/chapter exports include it', async ({ page }, testInfo) => {
  if (!['desktop-1280-active', 'laptop-1440'].includes(testInfo.project.name)) test.skip();
  const viewport = testInfo.project.name === 'desktop-1280-active' ? { width: 1280, height: 900 } : { width: 1440, height: 900 };
  await page.setViewportSize(viewport);
  const flow = await openActiveLesson(page);
  await submitChunk(page, flow, 'پاسخ من: دامنه را از مؤلفه‌های اول می‌نویسم.', /گام بعدی/);
  await submitChunk(page, flow, 'پاسخ من: هر ورودی فقط یک خروجی دارد.', /رفتن به مثال‌ها/);

  const compare = flow.getByRole('button', { name: /مقایسه با حل درس‌نامه/ });
  await expect(compare).toHaveCount(0);
  const exampleField = flow.locator('.lesson-math-editor math-field').first();
  await flow.getByRole('button', { name: 'بازکردن صفحه‌کلید' }).click();
  await flow.getByRole('group', { name: 'Numeric keys' }).getByRole('button', { name: '2', exact: true }).click();
  await expect.poll(() => mathValue(exampleField)).toContain('2');
  await expect(compare).toBeVisible();
  await compare.click();
  await expect(flow.locator('.lesson-work-solution')).toContainText('برد:');

  await flow.getByRole('button', { name: /شروع.*تمرین کتاب/ }).click();
  await dismissWellbeing(page);
  const practiceField = page.locator('math-field[aria-label="Step 1 expression"]');
  await clickMathKeys(page, '9');
  await expect.poll(() => mathValue(practiceField)).toContain('9');
  await page.getByRole('button', { name: 'Finish session' }).click();
  const confidence = page.getByRole('dialog', { name: /confidence/i });
  await confidence.getByRole('radio', { name: 'Medium' }).click();
  await confidence.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.lesson-concept-summary')).toBeVisible();
  await expect(page.locator('.lesson-concept-summary')).toContainText('پاسخ من');
  await page.screenshot({ path: testInfo.outputPath(`active-lesson-${testInfo.project.name}-concept-summary.png`), fullPage: true });

  const lessonMenu = page.locator('.lesson-export-menu').nth(0);
  await lessonMenu.locator('summary').click();
  const mdDownload = page.waitForEvent('download');
  await lessonMenu.getByRole('button', { name: 'Markdown (.md)' }).click();
  const md = await mdDownload;
  const mdContent = await readFile(await md.path(), 'utf8');
  expect(md.suggestedFilename()).toMatch(/lesson-export\.md$/);
  expect(mdContent).toContain('<div dir="rtl" lang="fa">');
  expect(mdContent).toContain('پاسخ من: دامنه را از مؤلفه‌های اول می‌نویسم.');
  expect(mdContent).toContain('پاسخ من');
  expect(mdContent).not.toContain('برد:');

  const lessonJsonMenu = page.locator('.lesson-export-menu').nth(0);
  await lessonJsonMenu.locator('summary').click();
  const lessonJsonDownload = page.waitForEvent('download');
  await lessonJsonMenu.getByRole('button', { name: 'JSON (.json)' }).click();
  const lessonJson = await lessonJsonDownload;
  const lessonJsonContent = await readFile(await lessonJson.path(), 'utf8');
  expect(JSON.parse(lessonJsonContent).lesson.id).toBe('ACTIVE-1.1');
  expect(lessonJsonContent).toContain('پاسخ من: هر ورودی فقط یک خروجی دارد.');
  expect(lessonJsonContent).not.toContain('برد:');

  const chapterMenu = page.locator('.lesson-export-menu').nth(1);
  await chapterMenu.locator('summary').click();
  const chapterDownload = page.waitForEvent('download');
  await chapterMenu.getByRole('button', { name: 'JSON (.json)' }).click();
  const chapter = await chapterDownload;
  const chapterContent = JSON.parse(await readFile(await chapter.path(), 'utf8'));
  expect(chapterContent.schemaVersion).toBe('math-scratchpad.chapter-export/1.0');
  expect(chapterContent.lessons.map((lesson: { id: string }) => lesson.id)).toContain('ACTIVE-1.1');
});
