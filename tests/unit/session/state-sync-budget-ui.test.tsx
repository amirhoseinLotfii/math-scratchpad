import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { StateBudgetMeter, OversizedStateWarning } from '../../../src/sync/state-sync-budget-ui';
import { ServerBackedStorage } from '../../../src/sync/server-storage';

it('warns when the serialized session reaches 80 percent of the sync budget', () => {
  const view = render(<StateBudgetMeter bytes={759_999} />);
  expect(screen.queryByRole('status')).toBeNull();
  view.rerender(<StateBudgetMeter bytes={760_000} />);
  expect(screen.getByRole('status').textContent).toContain('۸۰٪ ظرفیت همگام‌سازی');
});

it('shows the Persian warning and a backup action for an oversized local session', () => {
  const mirror = new ServerBackedStorage([], 'owner-token');
  const download = vi.fn();
  render(<OversizedStateWarning storage={mirror} onBackup={download} />);
  act(() => mirror.setItem('math-scratchpad-session-v3', 'م'.repeat(550_000)));
  expect(screen.getByRole('status').textContent).toContain('این جلسه برای همگام‌سازی ابری خیلی بزرگ است');
  screen.getByRole('button', { name: 'دانلود پشتیبان کامل JSON' }).click();
  expect(download).toHaveBeenCalledOnce();
});
