import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { renderMobileApp } from '../support/render-mobile-app';
import { readArchive } from '../../src/features/drive-bank/drive-bank';
vi.mock('../../src/features/drive-bank/identity', () => ({ permittedAccount: async () => true }));

const bank = (source: string, version = 'v1') => ({ schema_version: 'math-scratchpad.bank/1.0', bank_id: 'practice', version, questions: [{ id: 'Q01', mode: 'math', source }, { id: 'Q02', mode: 'math', source: '2+2' }] });
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers(); delete window.google; delete window.gapi; });

function mockGoogle() {
  const picker = { ViewId: { DOCS: 'docs' }, DocsViewMode: { LIST: 'list' }, Action: { PICKED: 'picked', CANCEL: 'cancel' },
    DocsView: class { setMimeTypes() { return this; } setMode() { return this; } setQuery() { return this; } },
    PickerBuilder: class { cb: (d: unknown) => void = () => undefined; addView() { return this; } setOAuthToken() { return this; } setDeveloperKey() { return this; } setAppId() { return this; } setOrigin() { return this; } setLocale() { return this; } setTitle() { return this; }
      setCallback(cb: (d: unknown) => void) { this.cb = cb; return this; } build() { return { setVisible: () => this.cb({ action: 'picked', docs: [{ id: 'private-file-123', name: 'MATH_QUESTION_BANK.json' }] }) }; } } };
  window.gapi = {};
  window.google = { picker, accounts: { oauth2: { hasGrantedAllScopes: () => true, initTokenClient: (cfg: { callback: (r: unknown) => void }) => ({ requestAccessToken: () => cfg.callback({ access_token: 'token', expires_in: 3600 }) }) } } };
}
function mockDrive(state: { content: string; rev: number }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = String(input);
    if (url.includes('userinfo')) return new Response(JSON.stringify({ email: 'student@example.com', email_verified: true }), { status: 200 });
    if (url.includes('alt=media')) return new Response(state.content, { status: 200 });
    if (url.includes('fields=')) return new Response(JSON.stringify({ id: 'private-file-123', name: 'MATH_QUESTION_BANK.json', mimeType: 'application/json', md5Checksum: `m${state.rev}`, headRevisionId: `r${state.rev}`, version: String(state.rev) }), { status: 200 });
    return new Response('', { status: 500 });
  });
}
async function connect(user: ReturnType<typeof renderMobileApp>['user']) {
  await user.click(screen.getByRole('button', { name: 'Exercise menu' }));
  await user.click(screen.getByRole('menuitem', { name: /Google Drive/ }));
  await waitFor(() => expect((screen.getByRole('button', { name: 'Connect Google Drive' }) as HTMLButtonElement).disabled).toBe(false));
  await user.click(screen.getByRole('button', { name: 'Connect Google Drive' }));
}
describe('private Drive bank flow', () => {
  it('uses built-in Google identifiers, shows no manual entry, and ignores old saved ones', async () => {
    localStorage.setItem('math-scratchpad-drive-config-v1', JSON.stringify({ clientId: 'old.apps.googleusercontent.com', apiKey: 'OLDKEY_old_old_old_old_old', appId: '1', fileId: '' }));
    const { getConfig } = await import('../../src/features/drive-bank/google');
    const { GOOGLE_CLIENT_ID, GOOGLE_APP_ID, GOOGLE_API_KEY } = await import('../../src/features/drive-bank/drive-config');
    expect(getConfig()).toMatchObject({ clientId: GOOGLE_CLIENT_ID, appId: GOOGLE_APP_ID, apiKey: GOOGLE_API_KEY });
    const { user } = renderMobileApp();
    await user.click(screen.getByRole('button', { name: 'Exercise menu' }));
    await user.click(screen.getByRole('menuitem', { name: /Google Drive/ }));
    expect(screen.queryByText('one-time setup')).toBeNull();
    expect(screen.queryByLabelText('OAuth client ID')).toBeNull();
  });
  it('explains invalid lesson data and leaves ordinary bank questions available', async () => {
    mockGoogle();
    const invalidLessons = { ...bank('1+2'), lessons: [{ id: 'BROKEN-LESSON', book: 'Sample book', section: '1.1', title: 42, concepts: [] }] };
    mockDrive({ content: JSON.stringify(invalidLessons), rev: 1 });
    const { user } = renderMobileApp();
    await connect(user);
    expect(await screen.findByText(/Some lesson content could not be read\. You can continue with the bank questions\./)).toBeTruthy();
    expect(await screen.findByText('Bank content notes (1)')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Open received batch' }));
    await user.click(await screen.findByRole('button', { name: 'Open batch' }));
    expect(screen.getByRole('region', { name: 'Current problem' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Exercise menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Lessons' }));
    expect(within(screen.getByRole('dialog', { name: 'Lessons' })).getByRole('status')).toHaveTextContent('This bank has no lessons yet');
  });
  it('picks the file, reads the bank, and archives the active work before switching', async () => {
    mockGoogle();
    mockDrive({ content: JSON.stringify(bank('1+2')), rev: 1 });
    const { store, user } = renderMobileApp(); const previous = store.getState().doc;
    await connect(user);
    await user.click(await screen.findByRole('button', { name: 'Open received batch' }));
    expect(await screen.findByRole('dialog', { name: 'Open a new question batch?' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Open batch' }));
    expect(store.getState().doc.exercises).toHaveLength(2);
    expect(store.getState().doc.session?.bankId).toBe('practice');
    expect(readArchive().some(s => JSON.parse(s.data).doc.session.id === previous.session?.id)).toBe(true);
    expect(JSON.parse(localStorage.getItem('math-scratchpad-drive-config-v1')!).fileId).toBe('private-file-123');
  });
  it('shows an empty file as waiting, then picks up a content change on the next poll without touching the open session', async () => {
    mockGoogle();
    const drive = { content: '', rev: 1 }; const fetchSpy = mockDrive(drive);
    const { store, user } = renderMobileApp();
    await connect(user);
    expect(await screen.findByText('Connected. The selected bank file is empty.')).toBeTruthy();
    const before = JSON.stringify(store.getState().doc);
    const mediaCalls = () => fetchSpy.mock.calls.filter(c => String(c[0]).includes('alt=media')).length;
    const n = mediaCalls();
    await user.click(screen.getByRole('button', { name: 'Check now' }));
    await waitFor(() => expect(mediaCalls()).toBe(n + 1)); // forced check re-downloads
    drive.content = JSON.stringify(bank('1+5', 'v2')); drive.rev = 2;
    await user.click(screen.getByRole('button', { name: 'Check now' }));
    expect(await screen.findByText(/version v2/)).toBeTruthy();
    expect(JSON.stringify(store.getState().doc)).toBe(before); // no auto switch
    expect(screen.getByRole('button', { name: 'Exercise menu' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open received batch' })).toBeEnabled();
    await act(async () => { await Promise.resolve(); });
  });
});
