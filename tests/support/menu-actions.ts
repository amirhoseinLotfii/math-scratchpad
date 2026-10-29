import { fireEvent, screen } from '@testing-library/react';

export function showMoreMenuActions() {
  if (!screen.queryByRole('menu')) fireEvent.click(screen.getByRole('button', { name: 'Exercise menu' }));
  const disclosure = screen.getByRole('menuitem', { name: 'Show more' });
  if (disclosure.getAttribute('aria-expanded') !== 'true') fireEvent.click(disclosure);
}

export function menuAction(name: string) {
  let item = screen.queryByRole('menuitem', { name });
  if (!item) {
    showMoreMenuActions();
    item = screen.queryByRole('menuitem', { name });
  }
  if (!item) throw new Error(`Menu action not found: ${name}`);
  return item;
}
