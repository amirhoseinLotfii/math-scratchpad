import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserSyncRuntime, setDefaultSyncRuntime } from '../../../src/sync/runtime';
import { SyncPanel } from '../../../src/sync/sync-panel';
import { initializeLearningStorage } from '../../../src/sync/browser-db';
import { installGooglePicker } from '../../helpers/sync-panel';
vi.mock('../../../src/features/drive-bank/identity', () => ({ permittedAccount: vi.fn() }));

describe('sync and migration panel', () => {
  it('traps keyboard focus in the floating inspector and restores the menu trigger after closing', async () => {
    await initializeLearningStorage();
    installGooglePicker();
    const trigger = document.createElement('button');
    trigger.textContent = 'Open sync';
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const { unmount } = render(<SyncPanel onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'همگام‌سازی و حفظ داده‌ها' });
    const close = within(dialog).getByRole('button', { name: 'بستن تنظیم همگام‌سازی' });
    expect(document.activeElement).toBe(close);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.body.style.overflow).toBe('hidden');
    await userEvent.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    trigger.focus();
    await userEvent.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe('');
    trigger.remove();
  });

  it('sends one explicitly classified synthetic event only when both mirrors are ready', async () => {
    await initializeLearningStorage();
    installGooglePicker();
    const sent: Array<Record<string, unknown>> = [];
    const mirror = { status: 'synced', pendingCount: 0, quarantinedCount: 0, lastSyncedAt: null, lastError: null };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/reset/status') return Response.json({ status: 'idle', epoch: '2026-11-12-v3' });
      if (url.pathname === '/reset/epoch') return Response.json({ epoch: '2026-11-12-v3' });
      if (url.pathname === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      if (url.pathname === '/sync') return Response.json({ events: [], cursor: 0, through: 0, hasMore: false });
      if (url.pathname === '/drive/status' || url.pathname === '/notion/status') return Response.json(mirror);
      if (url.pathname === '/events') {
        const body = JSON.parse(String(init?.body)) as { events: Array<Record<string, unknown>> };
        sent.push(...body.events);
        return Response.json({ events: body.events.map((event, index) => ({ id: event.id, seq: index + 1 })) });
      }
      if (url.pathname === '/drive/sync') return Response.json({ drive: mirror });
      if (url.pathname === '/notion/sync') return Response.json({ notion: mirror });
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher });
    setDefaultSyncRuntime(runtime);
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await runtime.syncNow();
    render(<SyncPanel />);
    const button = screen.getByRole('button', { name: 'تست امن اتصال Drive و Notion' });
    await vi.waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(button);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ isTest: true, bankVersion: 'sync-test-v1', lesson: 'sync-verification' });
    await vi.waitFor(() => {
      expect(fetcher.mock.calls.some(([input]) => new URL(String(input)).pathname === '/drive/sync')).toBe(true);
      expect(fetcher.mock.calls.some(([input]) => new URL(String(input)).pathname === '/notion/sync')).toBe(true);
    });
    runtime.stop();
  });

  it('shows separate server, Drive, and Notion status and manually syncs configured mirrors', async () => {
    await initializeLearningStorage();
    installGooglePicker();
    const paths: Array<{ path: string; method: string }> = [];
    let drive = { status: 'pending', pendingCount: 3, quarantinedCount: 2, lastSyncedAt: '2026-11-02T01:00:00.000Z', lastError: null };
    const notion = { status: 'not_configured', pendingCount: 4, quarantinedCount: 0, lastSyncedAt: null, lastError: null };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input)),
        method = init?.method ?? 'GET';
      paths.push({ path: url.pathname, method });
      if (url.pathname === '/reset/status') return Response.json({ status: 'idle', epoch: '2026-11-12-v3' });
      if (url.pathname === '/reset/epoch') return Response.json({ epoch: '2026-11-12-v3' });
      if (url.pathname === '/snapshot') return Response.json({ events: [], cursor: 0, through: 0, snapshotCursor: 0, hasMore: false });
      if (url.pathname === '/sync') return Response.json({ events: [], cursor: 0, through: 0, hasMore: false });
      if (url.pathname === '/drive/status') return Response.json(drive);
      if (url.pathname === '/notion/status') return Response.json(notion);
      if (url.pathname === '/drive/sync' && method === 'POST') {
        drive = { status: 'synced', pendingCount: 0, quarantinedCount: 2, lastSyncedAt: '2026-11-02T01:15:00.000Z', lastError: null };
        return Response.json({ drive });
      }
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher });
    setDefaultSyncRuntime(runtime);
    await runtime.start();
    runtime.setIdToken('owner-id-token');
    await runtime.syncNow();

    render(<SyncPanel />);
    const driveStatus = screen.getByRole('group', { name: 'وضعیت Google Drive' });
    const notionStatus = screen.getByRole('group', { name: 'وضعیت Notion' });
    expect(within(screen.getByRole('group', { name: 'وضعیت سرور' })).getByText('همگام‌شده با سرور')).toBeTruthy();
    expect(await within(driveStatus).findByText('در صف ارسال')).toBeTruthy();
    expect(await within(driveStatus).findByText('3 رویداد در صف')).toBeTruthy();
    expect(await within(driveStatus).findByText('2 رویداد بدون برچسب قرنطینه شد و ارسال نشد.')).toBeTruthy();
    expect(await within(notionStatus).findByText('راه‌اندازی نشده')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'تست امن اتصال Drive و Notion' }) as HTMLButtonElement).disabled).toBe(true);
    expect(await within(notionStatus).findByText('4 رویداد در صف')).toBeTruthy();
    expect(await within(notionStatus).findByText('رویداد بدون برچسبی برای قرنطینه وجود ندارد.')).toBeTruthy();

    const syncDetails = screen.getByText('جزئیات آخرین همگام‌سازی و خطاها').closest('details');
    expect(syncDetails).not.toBeNull();
    await userEvent.click(syncDetails!.querySelector('summary')!);
    expect(within(syncDetails!).getAllByText('هنوز همگام نشده').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'همگام‌سازی الان' }));
    await vi.waitFor(() => expect(within(driveStatus).getByText('همگام‌شده')).toBeTruthy());
    expect(paths).toContainEqual({ path: '/drive/sync', method: 'POST' });
    expect(paths).not.toContainEqual({ path: '/notion/sync', method: 'POST' });
    runtime.stop();
  });

  it('announces current sync status and returns focus through its close action', async () => {
    await initializeLearningStorage();
    const onClose = vi.fn();
    installGooglePicker();
    render(<SyncPanel onClose={onClose} />);
    expect(await screen.findByRole('heading', { name: 'همگام‌سازی و حفظ داده‌ها' })).toBeTruthy();
    expect(screen.getByText('آمادهٔ همگام‌سازی').getAttribute('role')).toBe('status');
    await userEvent.click(screen.getByRole('button', { name: 'بستن تنظیم همگام‌سازی' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
