import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { renderMobileApp } from '../support/render-mobile-app';
import { readArchive } from '../../src/features/drive-bank/drive-bank';
vi.mock('../../src/features/drive-bank/identity', () => ({ permittedAccount: async () => true }));

const bank = { schema_version: 'math-scratchpad.bank/1.0', bank_id: 'practice', version: 'v1', questions: [{ id: 'Q01', mode: 'math', source: '1+2' }, { id: 'Q02', mode: 'math', source: '2+2' }] };
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); delete window.google; });
describe('private Drive bank flow', () => {
  it('checks the Google account, reads the bank, and archives the active work before switching', async () => {
    window.google = { accounts: { oauth2: { initTokenClient: cfg => ({ requestAccessToken: () => cfg.callback({ access_token: 'token', expires_in: 3600 }) }) } } };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('userinfo')) return new Response(JSON.stringify({ email: 'student@example.com', email_verified: true }), { status: 200 });
      if (url.includes('alt=media')) return new Response(JSON.stringify(bank), { status: 200 });
      return new Response(JSON.stringify({ files: [{ id: 'private-file-123' }] }), { status: 200 });
    });
    const { store, user } = renderMobileApp(); const previous = store.getState().doc;
    await user.click(screen.getByRole('button', { name: 'Exercise menu' }));
    await user.click(screen.getByRole('menuitem', { name: /Google Drive/ }));
    await user.type(screen.getByLabelText('شناسه OAuth برنامه'), '123.apps.googleusercontent.com');
    await waitFor(() => expect((screen.getByRole('button', { name: 'اتصال Google Drive' }) as HTMLButtonElement).disabled).toBe(false));
    await user.click(screen.getByRole('button', { name: 'اتصال Google Drive' }));
    await user.click(await screen.findByRole('button', { name: 'بازکردن دستهٔ دریافت‌شده' }));
    expect(store.getState().doc.exercises).toHaveLength(2);
    expect(store.getState().doc.session?.bankId).toBe('practice');
    expect(readArchive().some(s => JSON.parse(s.data).doc.session.id === previous.session?.id)).toBe(true);
  });
});
