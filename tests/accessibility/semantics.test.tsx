import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import { renderMobileApp } from '../support/render-mobile-app';
import { scanDOM } from '../support/accessibility';
afterEach(cleanup);

describe('A11Y-SEM: document, controls and language', () => {
 it('has no automatically detected structural WCAG A/AA violations in batch edit state', async () => {
  const { container } = renderMobileApp(); expect(await scanDOM(container)).toEqual([]);
 });
 it('has no structural violations in single-question edit state', async () => {
  const { container } = renderMobileApp({ batch: false }); expect(await scanDOM(container)).toEqual([]);
 });
 it('exposes one named main landmark and one top-level heading', () => {
  renderMobileApp(); expect(screen.getAllByRole('main')).toHaveLength(1);
  expect(screen.getByRole('main')).toHaveAccessibleName('Math Scratchpad');
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
 });
 it('gives every interactive control a discernible accessible name', () => {
  renderMobileApp();
  for (const element of screen.getAllByRole('button')) expect(element).toHaveAccessibleName();
  for (const element of screen.getAllByRole('combobox')) expect(element).toHaveAccessibleName();
 });
 it('labels icon-only reset/delete/menu independently of their SVG glyphs', () => {
  renderMobileApp();
  for (const name of ['Reset Step 1', 'Delete Step 1', 'Exercise menu']) {
   const button = screen.getByRole('button', { name });
   expect(button).toHaveAccessibleName(name);
   for (const icon of button.querySelectorAll('svg')) expect(icon).toHaveAttribute('aria-hidden', 'true');
  }
 });
 it('exposes protected deletion with native disabled semantics', () => {
  renderMobileApp(); expect(screen.getByRole('button', { name: 'Delete Step 1' })).toBeDisabled();
 });
 it('never creates duplicate element IDs', () => {
  const { container } = renderMobileApp(); const ids = [...container.querySelectorAll('[id]')].map(x => x.id);
  expect(new Set(ids).size).toBe(ids.length);
 });
 it('does not use positive tabindex to manufacture focus order', () => {
  const { container } = renderMobileApp();
  expect([...container.querySelectorAll('[tabindex]')].filter(x => Number(x.getAttribute('tabindex')) > 0)).toEqual([]);
 });
 it('does not nest one actionable control inside another', () => {
  const { container } = renderMobileApp();
  expect(container.querySelectorAll('button button, button a[href], a[href] button, button input').length).toBe(0);
 });
 it('isolates Persian question language from English interface and LTR formula', () => {
  renderMobileApp(); const main = screen.getByRole('main'); expect(main).toHaveAttribute('lang', 'en');
  const prompt = main.querySelector('.persian-question'); expect(prompt).toHaveAttribute('lang', 'fa'); expect(prompt).toHaveAttribute('dir', 'rtl');
  const formula = within(main).getByLabelText('Step 1 expression');
  expect(formula.querySelector('[dir="ltr"]')).not.toBeNull();
  expect([...main.querySelectorAll('button, label, legend, [role="status"]')].filter(x => /[\u0600-\u06ff]/.test(x.textContent ?? ''))).toEqual([]);
 });
 it('math token labels provide step and field context rather than only a digit', () => {
  renderMobileApp({ batch: false }); const expression = screen.getByLabelText('Step 1 expression');
  const buttons = [...expression.querySelectorAll<HTMLButtonElement>('[data-node-id]')];
  expect(buttons.length).toBeGreaterThan(0);
  for (const button of buttons) expect(button.getAttribute('aria-label')).toMatch(/Step 1/);
 });
 it('does not make the once-per-second timer an assertive live announcement', () => {
  renderMobileApp(); const time = screen.getByLabelText('Question elapsed time');
  expect(time.closest('[aria-live="assertive"], [role="alert"]')).toBeNull();
 });
 it('exposes progress value and question count to assistive technologies', () => {
  renderMobileApp(); const progress = screen.getByRole('progressbar', { name: /progress/i });
  expect(Number(progress.getAttribute('aria-valuemin'))).toBe(0);
  expect(Number(progress.getAttribute('aria-valuemax'))).toBeGreaterThan(0);
  expect(progress).toHaveAttribute('aria-valuenow');
 });
});
