import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import { renderMobileApp } from '../support/render-mobile-app';
import { scanDOM } from '../support/accessibility';
afterEach(cleanup);

describe('A11Y-FORM: validation, explanation and error focus', () => {
 it('confidence has no default; Continue without a choice explains the error and does not advance', async () => {
  const { user, store } = renderMobileApp(); const id = store.getState().doc.exerciseId; await user.click(screen.getByRole('button', { name: /Next question/i }));
  const dialog = screen.getByRole('dialog', { name: /confidence/i });
  expect(within(dialog).getByRole('radio', { name: 'High' })).not.toBeChecked();
  await user.click(within(dialog).getByRole('button', { name: /continue/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/Choose your confidence/);
  expect(store.getState().doc.exercises[0].confidence).toBeUndefined();
  expect(store.getState().doc.exerciseId).toBe(id);
 });
 it('a lower confidence choice replaces the default before Continue', async () => {
  const { user, store } = renderMobileApp(); await user.click(screen.getByRole('button', { name: /Next question/i }));
  await user.click(screen.getByRole('radio', { name: 'Low' }));
  await user.click(screen.getByRole('button', { name: /continue/i }));
  expect(store.getState().doc.exercises[0].confidence).toBe('low');
 });
 it('confidence dialog remains structurally accessible to axe', async () => {
  const { user } = renderMobileApp(); await user.click(screen.getByRole('button', { name: /Next question/i }));
  expect(await scanDOM(screen.getByRole('dialog'))).toEqual([]);
 });
 it('empty new-problem submission does not create a question and focuses its labelled field', async () => {
  const { user, store } = renderMobileApp({ batch: false });
  await user.click(screen.getByRole('button', { name: 'Exercise menu' }));
  await user.click(screen.getByRole('menuitem', { name: 'New Problem' }));
  await user.click(screen.getByRole('button', { name: 'Start' }));
  const field = screen.getByLabelText('Problem');
  expect(store.getState().doc.exercises).toHaveLength(1); expect(screen.getByRole('alert')).toHaveTextContent(/problem|required/i);
  expect(field).toHaveAttribute('aria-invalid', 'true'); expect(field).toHaveFocus();
 });
 it('invalid imported JSON is explained without losing the typed recovery text or active work', async () => {
  const { user, store } = renderMobileApp(); const answers = store.getState().doc.exercises.map(e => e.steps);
  await user.click(screen.getByRole('button', { name: 'Exercise menu' }));
  await user.click(screen.getByRole('menuitem', { name: 'Show more' }));
  await user.click(screen.getByRole('menuitem', { name: 'Import session JSON' }));
  const field = screen.getByRole('textbox', { name: 'Copy or paste session JSON' });
  await user.clear(field); await user.type(field, 'not JSON'); await user.click(screen.getByRole('button', { name: 'Restore' }));
  expect(field).toHaveValue('not JSON'); expect(screen.getByRole('alert')).not.toBeEmptyDOMElement();
  expect(field).toHaveAttribute('aria-invalid', 'true'); expect(field).toHaveFocus();
  expect(store.getState().doc.exercises.map(e => e.steps)).toEqual(answers);
 });
});

describe('A11Y-MENU: shadcn dropdown interaction contract', () => {
 it('menu trigger exposes its popup role and current open state', async () => {
  const { user } = renderMobileApp(); const trigger = screen.getByRole('button', { name: 'Exercise menu' });
  expect(trigger).toHaveAttribute('aria-haspopup', 'menu'); expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await user.click(trigger); expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('menu')).toBeVisible();
 });
 it('ArrowDown opens menu and moves focus to its first action', async () => {
  const { user } = renderMobileApp(); screen.getByRole('button', { name: 'Exercise menu' }).focus();
  await user.keyboard('[ArrowDown]'); const menu = screen.getByRole('menu');
  expect(menu.contains(document.activeElement)).toBe(true);
 });
 it('End and Home navigate menu actions without activating them', async () => {
  const { user, store } = renderMobileApp(); const original = store.getState().doc.exerciseId;
  await user.click(screen.getByRole('button', { name: 'Exercise menu' }));
  const menu = screen.getByRole('menu'), items = within(menu).getAllByRole('menuitem');
  await user.keyboard('[End]'); expect(items.at(-1)).toHaveFocus();
  await user.keyboard('[Home]'); expect(items[0]).toHaveFocus();
  expect(store.getState().doc.exerciseId).toBe(original);
 });
 it('Escape closes the menu and restores trigger focus', async () => {
  const { user } = renderMobileApp(); const trigger = screen.getByRole('button', { name: 'Exercise menu' });
  await user.click(trigger); await user.keyboard('[Escape]');
  expect(screen.queryByRole('menu')).toBeNull(); expect(trigger).toHaveFocus();
 });
 it('keeps data actions collapsed until Show more and exposes them accessibly when expanded', async () => {
  const { user } = renderMobileApp(); await user.click(screen.getByRole('button', { name: 'Exercise menu' }));
  const menu = screen.getByRole('menu');
  expect(within(menu).queryByRole('menuitem', { name: /Copy full session JSON/i })).toBeNull();
  await user.click(within(menu).getByRole('menuitem', { name: 'Show more' }));
  expect(within(menu).getByRole('menuitem', { name: /Copy full session JSON/i })).toBeVisible();
  expect(await scanDOM(menu)).toEqual([]);
 });
});
