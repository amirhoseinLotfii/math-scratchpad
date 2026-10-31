import { expect, test } from './support/test';

test('MathLive keeps precise editing, explicit keypad access, and a lossless saved Step', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-390', 'Exercise the phone editor once, then vary viewport size in a separate visual review.');
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto('/');
  // These E2E browser contexts are isolated; clear only this test origin's app
  // keys so a prior local run cannot change the starting Step.
  await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('math-scratchpad')).forEach(key => localStorage.removeItem(key)));
  await page.reload();

  const field = page.locator('math-field[aria-label="Step 1 expression"]');
  await expect(field).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show Keyboard' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('group', { name: 'Numeric keys' })).toHaveCount(0);
  const keyboardState = await field.evaluate(element => {
    const mathfield = element as HTMLElement & { mathVirtualKeyboardPolicy: string };
    return { policy: mathfield.mathVirtualKeyboardPolicy, visible: (window as Window & { mathVirtualKeyboard?: { visible: boolean } }).mathVirtualKeyboard?.visible ?? false };
  });
  expect(keyboardState).toEqual({ policy: 'manual', visible: false });

  const readLatex = () => field.evaluate(element => (element as HTMLElement & { value: string }).value);
  await field.click();
  await expect.poll(() => field.evaluate(element => document.activeElement === element)).toBe(true);
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & { hasFocus: () => boolean }).hasFocus())).toBe(true);
  // Replace the app's default expression to verify physical typing and editing.
  await page.keyboard.press('Control+A');
  await page.keyboard.type('1234');
  await expect.poll(readLatex).toBe('1234');
  await field.evaluate(element => { (element as HTMLElement & { position: number }).position = 0; });
  await page.keyboard.type('-');
  await expect.poll(readLatex).toBe('-1234');
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & { position: number }).position)).toBe(1);
  const beforeUndo = await readLatex();
  await page.keyboard.press('Control+z');
  await expect.poll(readLatex).not.toBe(beforeUndo);
  const afterUndo = await readLatex();
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(readLatex).toBe(beforeUndo);
    await page.keyboard.press('Control+z');
    await expect.poll(readLatex).toBe(afterUndo);
  }
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(readLatex).toBe(beforeUndo);

  await page.getByRole('button', { name: 'Show Keyboard' }).click();
  await expect(page.getByRole('group', { name: 'Numeric keys' })).toBeVisible();
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & { hasFocus: () => boolean }).hasFocus())).toBe(true);
  const builtInKeyboardToggle = await field.evaluate(element => {
    const toggle = (element as HTMLElement).shadowRoot?.querySelector<HTMLElement>('[part="virtual-keyboard-toggle"]');
    return toggle ? getComputedStyle(toggle).display : 'missing';
  });
  expect(builtInKeyboardToggle).toBe('none');
  const builtInMenuToggle = await field.evaluate(element => {
    const toggle = (element as HTMLElement).shadowRoot?.querySelector<HTMLElement>('[part="menu-toggle"]');
    return toggle ? getComputedStyle(toggle).display : 'missing';
  });
  expect(builtInMenuToggle).toBe('none');
  expect(await page.evaluate(() => (window as Window & { mathVirtualKeyboard?: { visible: boolean } }).mathVirtualKeyboard?.visible ?? false)).toBe(false);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await field.evaluate(element => {
    const mathfield = element as HTMLElement & { position: number; lastOffset: number };
    mathfield.position = mathfield.lastOffset;
  });
  await page.getByRole('button', { name: 'Fraction', exact: true }).click();
  await page.getByRole('button', { name: '2', exact: true }).click();
  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByRole('button', { name: 'Next field' }).click();
  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByRole('button', { name: '3', exact: true }).click();
  await expect.poll(readLatex).toContain('\\frac23');

  const beforeReload = await readLatex();
  const stepId = await field.getAttribute('data-step-id');
  await page.getByRole('button', { name: 'Mark Step 1 as final' }).click();
  await expect(page.getByRole('button', { name: 'Mark Step 1 as final' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('math-scratchpad-session-v3') ?? 'null');
    return saved?.state?.session?.doc?.exercises?.[0]?.steps?.[0]?.mathLatex ?? null;
  })).toBe(beforeReload);

  await page.reload();
  const restoredField = page.locator('math-field[aria-label="Step 1 expression"]');
  await expect.poll(() => restoredField.evaluate(element => (element as HTMLElement & { value: string }).value)).toBe(beforeReload);
  await expect(restoredField).toHaveAttribute('data-step-id', stepId!);
  await expect(page.getByRole('button', { name: 'Mark Step 1 as final' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Hide Keyboard' })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Hide Keyboard' }).click();
  await expect(page.getByRole('group', { name: 'Numeric keys' })).toHaveCount(0);
});

test('MathLive read-only rendering covers nested fractions, matrices, derivatives, integrals, and limits', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1024', 'Exercise static math rendering once at tablet width.');
  await page.goto('/');
  const expressions = [
    String.raw`\frac{1}{1+\frac{1}{2}}`,
    String.raw`\begin{bmatrix}1&2\\3&4\end{bmatrix}`,
    String.raw`\frac{\mathrm{d}}{\mathrm{d}x}x^2`,
    String.raw`\int_0^1 x^2\,\mathrm{d}x`,
    String.raw`\lim_{x\to0}\frac{\sin x}{x}`,
  ];
  await page.evaluate(async formulas => {
    await customElements.whenDefined('math-div');
    const fixture = document.createElement('section');
    fixture.setAttribute('aria-label', 'MathLive notation coverage');
    fixture.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:999;background:#202326;color:white;padding:12px;display:grid;gap:8px';
    formulas.forEach((formula, index) => {
      const math = document.createElement('math-div');
      math.setAttribute('aria-label', `Notation ${index + 1}`);
      math.setAttribute('dir', 'ltr');
      math.textContent = formula;
      fixture.append(math);
    });
    document.body.append(fixture);
  }, expressions);

  const notation = page.getByLabel('MathLive notation coverage');
  await expect(notation.locator('math-div')).toHaveCount(5);
  await expect(notation.locator('math-div').nth(0)).toBeVisible();
  await expect(notation.locator('math-div').nth(1)).toBeVisible();
  await expect(notation.locator('math-div').nth(4)).toBeVisible();
  const dimensions = await notation.locator('math-div').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height, overflow: element.scrollWidth > element.clientWidth };
  }));
  expect(dimensions.every(item => item.width > 0 && item.height > 0 && !item.overflow)).toBe(true);
  await expect(page.locator('math-field[aria-label="Step 1 expression"]')).toBeVisible();
});

test('MathLive inserts and edits calculus and matrix structures without changing saved Step identity', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1024', 'Exercise advanced editable templates once at tablet width.');
  await page.goto('/');
  await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('math-scratchpad')).forEach(key => localStorage.removeItem(key)));
  await page.reload();
  const field = page.locator('math-field[aria-label="Step 1 expression"]');
  await field.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await expect.poll(() => field.evaluate(element => (element as HTMLElement & { value: string }).value)).toBe('\\placeholder{}');
  await page.getByRole('button', { name: 'Show Keyboard' }).click();

  const readLatex = () => field.evaluate(element => (element as HTMLElement & { value: string }).value);
  async function insertTool(name: string) {
    await page.getByRole('button', { name: 'More math tools' }).click();
    const dialog = page.getByRole('dialog', { name: 'Insert Math Element' });
    await dialog.getByRole('button', { name: /Show more/ }).click();
    await dialog.getByRole('button', { name, exact: true }).click();
    await expect.poll(() => field.evaluate(element => (element as HTMLElement & { value: string }).value)).toContain('placeholder');
    await expect.poll(() => field.evaluate(element => document.activeElement === element)).toBe(true);
  }
  async function fillFields(values: string[]) {
    const moreTools = page.getByRole('button', { name: 'More tools', exact: true });
    for (let index = 0; index < values.length; index++) {
      const placeholdersBefore = (await readLatex()).match(/\\placeholder\{\}/g)?.length ?? 0;
      if (index) {
        if (await moreTools.getAttribute('aria-expanded') !== 'true') await moreTools.click();
        await page.getByRole('button', { name: 'Next field' }).click();
      }
      await page.keyboard.type(values[index]);
      await expect.poll(async () => (await readLatex()).match(/\\placeholder\{\}/g)?.length ?? 0).toBe(placeholdersBefore - 1);
    }
  }

  await insertTool('Derivative');
  await fillFields(['x', 'x']);
  await expect.poll(readLatex).toContain(String.raw`\frac{\mathrm{d}}{\mathrm{d}\,x}x`);
  await field.evaluate(element => { const mathfield = element as HTMLElement & { position: number; lastOffset: number }; mathfield.position = mathfield.lastOffset; });

  await insertTool('Integral');
  await fillFields(['0', '1', 'x', 'x']);
  await expect.poll(readLatex).toContain(String.raw`\int_0^1x\,\mathrm{d}\,x`);
  await field.evaluate(element => { const mathfield = element as HTMLElement & { position: number; lastOffset: number }; mathfield.position = mathfield.lastOffset; });

  await insertTool('Limit');
  await fillFields(['x', '0', '1']);
  await expect.poll(readLatex).toMatch(/\\lim.*x.*0.*1/);
  await field.evaluate(element => { const mathfield = element as HTMLElement & { position: number; lastOffset: number }; mathfield.position = mathfield.lastOffset; });

  await insertTool('2 by 2 matrix');
  await fillFields(['1', '2', '3', '4']);
  await expect.poll(readLatex).toMatch(/\\begin\{bmatrix\}1\s*&\s*2\\\\\s*3\s*&\s*4\\end\{bmatrix\}/);
  const beforeReload = await readLatex();
  const stepId = await field.getAttribute('data-step-id');
  await page.getByRole('button', { name: 'Mark Step 1 as final' }).click();
  await page.reload();
  const restored = page.locator('math-field[aria-label="Step 1 expression"]');
  await expect.poll(() => restored.evaluate(element => (element as HTMLElement & { value: string }).value)).toBe(beforeReload);
  await expect(restored).toHaveAttribute('data-step-id', stepId!);
  await expect(page.getByRole('button', { name: 'Mark Step 1 as final' })).toHaveAttribute('aria-pressed', 'true');
});
