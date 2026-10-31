import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen, within, fireEvent } from '@testing-library/react';
import { renderMobileApp } from '../support/render-mobile-app';
afterEach(cleanup);
describe('tutor export and session UI', () => {
 it('Alt+Enter marks the current step as final answer from the keyboard', async () => {
  const { store } = renderMobileApp();
  const editor = screen.getByLabelText('Step 1 expression');
  fireEvent.keyDown(editor, { key: '5' }); fireEvent.keyDown(editor, { key: 'Enter', altKey: true });
  expect(store.getState().doc.exercises[0].steps[0].final).toBe(true);
  expect(screen.getByText(/Final answer: Step 1/)).toBeTruthy();
 });
 it('warns before export when an answered item has no final answer', async () => {
  const { store, user } = renderMobileApp();
  fireEvent.keyDown(screen.getByLabelText('Step 1 expression'), { key: '5' });
  await user.click(screen.getByRole('button', { name: 'Exercise menu' }));
  await user.click(screen.getByRole('menuitem', { name: /Export for tutor/ }));
  const dialog = await screen.findByRole('dialog', { name: /Final answer missing/ });
  expect(dialog.textContent).toContain('Q1');
  await user.click(within(dialog).getByRole('button', { name: /Go back/ }));
  expect(store.getState().doc.exercises[0].steps[0].final).toBe(false);
 });
 it('records anxiety, energy and help used', async () => {
  const { store, user } = renderMobileApp();
  await user.click(screen.getByRole('button', { name: 'Exercise menu' }));
  await user.click(screen.getByRole('menuitem', { name: 'Show more' }));
  await user.click(screen.getByRole('menuitem', { name: 'Session details' }));
  const session = screen.getByRole('group', { name: 'Session details' });
  await user.click(within(session).getByRole('menuitem', { name: 'Change' }));
  const dialog = await screen.findByRole('dialog', { name: /Change session ratings/ });
  await user.click(within(within(dialog).getByRole('radiogroup', { name: 'Math anxiety' })).getByRole('radio', { name: '2' }));
  await user.click(within(within(dialog).getByRole('radiogroup', { name: 'Energy' })).getByRole('radio', { name: '4' }));
  await user.click(within(dialog).getByRole('button', { name: 'Start' }));
  expect(store.getState().doc.session).toMatchObject({ anxiety: 2, energy: 4 });
  await user.click(screen.getByRole('button', { name: 'Exercise menu' }));
  await user.click(screen.getByRole('menuitem', { name: 'Show more' }));
  await user.click(screen.getByRole('menuitem', { name: 'Session details' }));
  const details = screen.getByRole('group', { name: 'Session details' });
  expect(within(details).getByText('2')).toBeTruthy();
  expect(within(details).getByText('4')).toBeTruthy();
 });
 it('reset current session requires confirmation', async () => {
  const { store, user } = renderMobileApp();
  await user.click(screen.getByRole('button', { name: 'Exercise menu' }));
  await user.click(screen.getByRole('menuitem', { name: 'Show more' }));
  await user.click(screen.getByRole('menuitem', { name: 'Reset current session' }));
  const dialog = await screen.findByRole('dialog', { name: /Reset current session/ });
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(store.getState().doc.exercises).toHaveLength(20);
  await user.click(screen.getByRole('button', { name: 'Exercise menu' }));
  await user.click(screen.getByRole('menuitem', { name: 'Show more' }));
  await user.click(screen.getByRole('menuitem', { name: 'Reset current session' }));
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reset session' }));
  expect(store.getState().doc.exercises).toHaveLength(1);
 });
});
