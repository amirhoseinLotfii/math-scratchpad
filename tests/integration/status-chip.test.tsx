import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusChip } from '../../src/pwa/status-chip';
import { GATE_STATUS_EVENT } from '../../src/pwa/connectivity-store';
import { resetOfflineBankCacheForTests } from '../../src/pwa/offline-bank-cache';

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
}

afterEach(async () => {
  cleanup();
  setOnline(true);
  await resetOfflineBankCacheForTests();
  vi.restoreAllMocks();
});

describe('status chip', () => {
  it('announces offline state without moving editor focus and shows the details at a phone width', async () => {
    const user = userEvent.setup();
    window.innerWidth = 320;
    const openSyncPanel = vi.fn();
    render(
      <>
        <input aria-label="Persian note" />
        <StatusChip onOpenSyncPanel={openSyncPanel} />
      </>,
    );
    const note = screen.getByRole('textbox', { name: 'Persian note' });
    note.focus();

    await act(async () => {
      window.dispatchEvent(new CustomEvent(GATE_STATUS_EVENT, { detail: { kind: 'online', reason: 'online' } }));
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });

    const chip = screen.getByRole('button', { name: 'وضعیت اتصال و آفلاین: آفلاین' });
    expect(chip).toHaveAttribute('aria-live', 'polite');
    expect(chip).toHaveAttribute('aria-atomic', 'true');
    expect(document.activeElement).toBe(note);

    await user.click(chip);
    const dialog = await screen.findByRole('dialog', { name: 'وضعیت آفلاین و همگام‌سازی' });
    expect(dialog).toHaveTextContent('اینترنت در دسترس نیست');
    expect(dialog).toHaveTextContent('بانک‌های ذخیره‌شده');
    expect(dialog).toHaveTextContent('تصاویر ذخیره‌شده');
    expect(dialog).toHaveTextContent('ذخیره‌سازی پایدار');
    expect(dialog).toHaveTextContent('نسخهٔ بستهٔ برنامه');
    expect(openSyncPanel).not.toHaveBeenCalled();
  });

  it('opens the existing sync panel when Google sign-in is needed', async () => {
    const user = userEvent.setup();
    const openSyncPanel = vi.fn();
    render(<StatusChip onOpenSyncPanel={openSyncPanel} />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent(GATE_STATUS_EVENT, { detail: { kind: 'blocked', reason: 'needs_login' } }));
    });

    await user.click(screen.getByRole('button', { name: 'وضعیت اتصال و آفلاین: نیاز به ورود' }));
    await user.click(await screen.findByRole('button', { name: 'ورود به همگام‌سازی' }));
    expect(openSyncPanel).toHaveBeenCalledOnce();
  });
});
