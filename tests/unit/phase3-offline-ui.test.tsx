import 'fake-indexeddb/auto';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SaveStatusPill } from '../../src/features/offline/save-status-pill';
import { StorageEvictionBanner } from '../../src/features/offline/storage-eviction-banner';
import { ModeTransferWizard } from '../../src/features/offline/mode-transfer-wizard';

describe('Phase 3 Offline UI Components - AC-S2, AC-S4, E2E-09', () => {
  it('renders SaveStatusPill with correct accessible aria-live and labels (AC-S2)', () => {
    const { rerender } = render(<SaveStatusPill status="saved_locally" uiLang="fa" />);
    const pill = screen.getByRole('status');
    expect(pill.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByText('ذخیره در حافظه دستگاه')).toBeDefined();

    rerender(<SaveStatusPill status="saved_to_drive" uiLang="fa" />);
    expect(screen.getByText('ذخیره در گوگل درایو')).toBeDefined();

    rerender(<SaveStatusPill status="queued_offline" uiLang="fa" />);
    expect(screen.getByText('در صف ذخیره (آفلاین)')).toBeDefined();

    rerender(<SaveStatusPill status="syncing" uiLang="fa" />);
    expect(screen.getByText('در حال ذخیره…')).toBeDefined();

    rerender(<SaveStatusPill status="error" uiLang="fa" />);
    expect(screen.getByText('خطا در ذخیره‌سازی')).toBeDefined();
  });

  it('renders StorageEvictionBanner when unpersisted or >7 days since export (E2E-09)', () => {
    const onExport = vi.fn();
    render(
      <StorageEvictionBanner
        daysSinceExport={10}
        persisted={false}
        uiLang="fa"
        onExportBackup={onExport}
      />
    );

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('توجه: خطر پاک‌شدن داده‌های آفلاین')).toBeDefined();
    expect(screen.getByText('محافظت از داده‌های آفلاین')).toBeDefined();

    const backupBtn = screen.getByText('دریافت نسخه پشتیبان');
    fireEvent.click(backupBtn);
    expect(onExport).toHaveBeenCalled();
  });

  it('renders ModeTransferWizard and allows strategy selection (AC-S4)', async () => {
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <ModeTransferWizard
        open={true}
        onOpenChange={onOpenChange}
        targetMode="online"
        uiLang="fa"
        onExecuteTransfer={onExecute}
      />
    );

    expect(screen.getByText('تغییر حالت ذخیره‌سازی')).toBeDefined();

    // Select option 2: Overwrite from drive
    const radioOption2 = screen.getByDisplayValue('overwrite_local_from_drive');
    fireEvent.click(radioOption2);

    const confirmBtn = screen.getByText('تأیید و تغییر حالت');
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(onExecute).toHaveBeenCalledWith('overwrite_local_from_drive');
  });
});
