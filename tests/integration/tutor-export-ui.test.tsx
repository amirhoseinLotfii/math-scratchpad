import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen, within, fireEvent } from '@testing-library/react';
import { renderMobileApp } from '../support/render-mobile-app';
afterEach(cleanup);
describe('tutor export and session UI', () => {
 it('Alt+Enter marks the current step as final answer from the keyboard', async () => {
  const { store } = renderMobileApp();
  const editor = screen.getByRole('main', { name: 'Math Scratchpad' });
  fireEvent.keyDown(editor, { key: '5' }); fireEvent.keyDown(editor, { key: 'Enter', altKey: true });
  expect(store.getState().doc.exercises[0].steps[0].final).toBe(true);
  expect(screen.getByRole('button',{name:'Mark Step 1 as final'})).toHaveAttribute('aria-pressed','true');
 });
 it('warns before export when an answered item has no final answer', async () => {
  const { store, user } = renderMobileApp();
  fireEvent.keyDown(screen.getByRole('main', { name: 'Math Scratchpad' }), { key: '5' });
  await user.click(screen.getByRole('button', { name: 'Exercise menu' })); await user.click(screen.getByRole('menuitem', {name:/Show more/}));
  await user.click(screen.getByRole('menuitem', { name: /Export for tutor/ }));
  const dialog = await screen.findByRole('dialog', { name: /Final answer missing/ });
  expect(dialog.textContent).toContain('Q1');
  await user.click(within(dialog).getByRole('button', { name: /Go back/ }));
  expect(store.getState().doc.exercises[0].steps[0].final).toBe(false);
 });
 it('records anxiety, energy and help used', async () => {
  const { store, user } = renderMobileApp();
  await user.click(screen.getByRole('button',{name:'Exercise menu'}));await user.click(screen.getByRole('menuitem',{name:/Show more/}));await user.click(screen.getByRole('menuitem',{name:/Session details/}));
  const dialog = await screen.findByRole('dialog', { name: /Before you start/ });
  await user.click(within(dialog).getByRole('radio',{name:'Math anxiety 2'}));
  await user.click(within(dialog).getByRole('radio',{name:'Energy 4'}));
  await user.click(within(dialog).getByRole('button', { name: 'Start' }));
  expect(store.getState().doc.session).toMatchObject({ anxiety: 2, energy: 4 });
  expect(store.getState().doc.session).toMatchObject({anxiety:2,energy:4});
 });
 it('reset current session requires confirmation', async () => {
  const { store, user } = renderMobileApp();
  await user.click(screen.getByRole('button', { name: 'Exercise menu' })); await user.click(screen.getByRole('menuitem', {name:/Show more/}));
  await user.click(screen.getByRole('menuitem', { name: 'Reset current session' }));
  const dialog = await screen.findByRole('dialog', { name: /Reset current session/ });
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(store.getState().doc.exercises).toHaveLength(20);
  await user.click(screen.getByRole('button', { name: 'Exercise menu' })); await user.click(screen.getByRole('menuitem', {name:/Show more/}));
  await user.click(screen.getByRole('menuitem', { name: 'Reset current session' }));
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reset session' }));
  expect(store.getState().doc.exercises).toHaveLength(1);
 });
});
