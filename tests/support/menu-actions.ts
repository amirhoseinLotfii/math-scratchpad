import { fireEvent, screen, within } from '@testing-library/react';

export function showMoreMenuActions() {
  if (!screen.queryByRole('menu')) fireEvent.click(screen.getByRole('button', { name: 'Exercise menu' }));
  const disclosure = screen.getByRole('menuitem', { name: 'Show more' });
  if (disclosure.getAttribute('aria-expanded') !== 'true') fireEvent.click(disclosure);
}

export function menuAction(name: string) {
  const namePattern = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  let item = screen.queryByRole('menuitem', { name: namePattern });
  if (!item) {
    showMoreMenuActions();
    item = screen.queryByRole('menuitem', { name: namePattern });
  }
  if (!item) throw new Error(`Menu action not found: ${name}`);
  return item;
}

export async function submenuAction(name: string) {
  showMoreMenuActions();
  const submenuName = /^(?:Start Round 1|Start 30-question diagnostic|Use example|Use current expression)/.test(name)
    ? 'Practice'
    : 'Data';
  const trigger = screen.getByRole('menuitem', { name: submenuName });
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
  const submenu = await screen.findByRole('menu', { name: submenuName });
  const items = await within(submenu).findAllByRole('menuitem');
  const item = items.find(candidate => candidate.textContent?.includes(name));
  if (!item) throw new Error(`Menu action not found in ${submenuName}: ${name}`);
  return item;
}
