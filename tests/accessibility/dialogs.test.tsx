import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import { renderMobileApp } from '../support/render-mobile-app';
import { scanDOM } from '../support/accessibility';
afterEach(cleanup);

describe('A11Y-DLG: modal confidence and symbols', () => {
 it('moves focus into confidence dialog and exposes its modal name', async () => {
  const { user } = renderMobileApp(); await user.click(screen.getByRole('button', { name: /Next question/i }));
  const dialog = screen.getByRole('dialog', { name: /confidence/i }); expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog.contains(document.activeElement)).toBe(true);
 });
 it('has a named radio group, three named choices and no implicit default', async () => {
  const { user } = renderMobileApp(); await user.click(screen.getByRole('button', { name: /Next question/i }));
  const group = screen.getByRole('radiogroup', { name: /confiden/i });
  expect(within(group).getAllByRole('radio')).toHaveLength(3);
  for (const name of ['Low','Medium','High']) expect(within(group).getByRole('radio', { name })).not.toBeChecked();
 });
 it('supports radio arrow-key selection without committing navigation', async () => {
  const { user, store } = renderMobileApp(); const id = store.getState().doc.exerciseId;
  await user.click(screen.getByRole('button', { name: /Next question/i }));
  const low = screen.getByRole('radio', { name: 'Low' }); low.focus(); await user.keyboard('[ArrowRight]');
  expect(screen.getByRole('radio', { name: 'Medium' })).toBeChecked(); expect(store.getState().doc.exerciseId).toBe(id);
 });
 it.each([false, true])('keeps repeated Tab navigation inside confidence (reverse=%s)', async reverse => {
  const { user } = renderMobileApp(); await user.click(screen.getByRole('button', { name: /Next question/i }));
  const dialog = screen.getByRole('dialog', { name: /confidence/i });
  for (let i = 0; i < 10; i++) { await user.tab({ shift: reverse }); expect(dialog.contains(document.activeElement)).toBe(true); }
 });
 it('Escape restores invoking focus and does not advance', async () => {
  const { user, store } = renderMobileApp(); const id = store.getState().doc.exerciseId;
  const next = screen.getByRole('button', { name: /Next question/i }); await user.click(next); await user.keyboard('[Escape]');
  expect(screen.queryByRole('dialog')).toBeNull(); expect(next).toHaveFocus(); expect(store.getState().doc.exerciseId).toBe(id);
 });
 it('has an explicit Cancel action so touch users can leave the modal', async () => {
  const { user } = renderMobileApp(); await user.click(screen.getByRole('button', { name: /Next question/i }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i }));
  expect(screen.queryByRole('dialog')).toBeNull();
 });
 it('confidence dialog has no automatically detected structural violations', async () => {
  const { user } = renderMobileApp(); await user.click(screen.getByRole('button', { name: /Next question/i }));
  expect(await scanDOM(screen.getByRole('dialog', { name: /confidence/i }))).toEqual([]);
 });
 it('slash opens a named symbols dialog and Escape preserves input', async () => {
  const { user, store } = renderMobileApp(); const before = store.getState().doc.exercises.map(({ elapsedMs, ...answer }) => answer);
  screen.getByRole('main').focus(); await user.keyboard('/');
  expect(screen.getByRole('dialog')).toHaveAccessibleName(); await user.keyboard('[Escape]');
  expect(store.getState().doc.exercises.map(({ elapsedMs, ...answer }) => answer)).toEqual(before);
 });
 it('symbols dialog contains no automatically detected structural violations', async () => {
  const { user } = renderMobileApp(); screen.getByRole('main').focus(); await user.keyboard('/');
  expect(await scanDOM(screen.getByRole('dialog'))).toEqual([]);
 });
 it('closing Symbols never opens a second confidence modal', async () => {
  const { user } = renderMobileApp(); screen.getByRole('main').focus(); await user.keyboard('/[Escape]');
  expect(screen.queryAllByRole('dialog')).toHaveLength(0);
 });
});
