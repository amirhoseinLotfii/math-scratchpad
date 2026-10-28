import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from '../../src/app/store-provider';
import { QuestionNavigator } from '../../src/features/workspace/components/question-navigator';
import { QuestionTimer } from '../../src/QuestionTimer';
import { DriveBankPanel, POLL_MS } from '../../src/features/drive-bank/drive-bank-panel';
import { actions, initialState, makeStore } from '../../src/store';
import { bankDocument, validateBank } from '../../src/features/drive-bank/drive-bank';
import { parse } from '../../src/parser';
import userEvent from '@testing-library/user-event';
vi.mock('../../src/features/drive-bank/identity', () => ({ permittedAccount: async (p: { email?: string }) => p?.email === 'me@example.com' }));

const BANK = (source = '1+2', version = 'v1') => JSON.stringify({ schema_version: 'math-scratchpad.bank/1.0', bank_id: 'GEN', version, questions: [{ id: 'A', mode: 'math', source }, { id: 'B', mode: 'text', source: 'متن' }] });
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers(); delete window.google; delete window.gapi; });

describe('question navigator', () => {
  it('shows answered/skipped counts, statuses, current item and keyboard movement', async () => {
    const doc = bankDocument(validateBank(JSON.parse(BANK())), 'x'); doc.exercises[0].steps[0].expression = parse('3'); doc.exercises[0].confidence = 'high'; doc.exercises[1].skipped = true;
    const onSelect = vi.fn(); render(<QuestionNavigator doc={doc} onSelect={onSelect} />);
    expect(screen.getByText('2 of 2 answered or skipped')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Question progress' }).getAttribute('aria-valuenow')).toBe('2');
    const buttons = screen.getAllByRole('button'); expect(buttons[0].textContent).toContain('Answered'); expect(buttons[1].textContent).toContain('Skipped');
    expect(buttons[0].getAttribute('aria-current')).toBe('page');
    const user = userEvent.setup(); buttons[0].focus(); await user.keyboard('{ArrowDown}'); expect(document.activeElement).toBe(buttons[1]); await user.keyboard('{Home}'); expect(document.activeElement).toBe(buttons[0]);
    await user.click(buttons[1]); expect(onSelect).toHaveBeenCalledWith(doc.exercises[1].id);
  });
  it('drafts without confidence do not count as answered', () => {
    const doc = bankDocument(validateBank(JSON.parse(BANK())), 'x'); doc.exercises[0].steps[0].expression = parse('3');
    render(<QuestionNavigator doc={doc} onSelect={() => undefined} />); expect(screen.getByText('0 of 2 answered or skipped')).toBeTruthy();
  });
});

describe('question timer display', () => {
  it.each([[0, '00:00'], [999, '00:00'], [61000, '01:01'], [3599000, '59:59'], [3600000, '60:00']])('%i ms -> %s', (ms, text) => {
    const store = makeStore(initialState()); render(<Provider store={store}><QuestionTimer exerciseId="x" elapsedMs={ms} /></Provider>);
    expect(screen.getByLabelText('Question elapsed time').textContent).toBe(text);
  });
  it('pause button toggles aria-pressed and label; direction is LTR', async () => {
    const store = makeStore(initialState()); const { container } = render(<Provider store={store}><QuestionTimer exerciseId="x" /></Provider>);
    const b = screen.getByRole('button', { name: 'Pause' }); expect(b.getAttribute('aria-pressed')).toBe('false');
    await userEvent.setup().click(b); expect(screen.getByRole('button', { name: 'Resume' }).getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.question-timer')?.getAttribute('dir')).toBe('ltr');
  });
});

function mockGoogle(email = 'me@example.com') {
  const picker = { ViewId: { DOCS: 'd' }, DocsViewMode: { LIST: 'l' }, Action: { PICKED: 'picked', CANCEL: 'cancel' }, DocsView: class { setMimeTypes() { return this; } setMode() { return this; } setQuery() { return this; } },
    PickerBuilder: class { cb: (d: unknown) => void = () => undefined; addView() { return this; } setOAuthToken() { return this; } setDeveloperKey() { return this; } setAppId() { return this; } setOrigin() { return this; } setTitle() { return this; } setCallback(cb: (d: unknown) => void) { this.cb = cb; return this; } build() { return { setVisible: () => this.cb({ action: 'picked', docs: [{ id: 'private-file-123', name: 'MATH_QUESTION_BANK.json' }] }) }; } } };
  window.gapi = {}; window.google = { picker, accounts: { oauth2: { hasGrantedAllScopes: () => true, initTokenClient: (c: { callback: (r: unknown) => void }) => ({ requestAccessToken: () => c.callback({ access_token: 'tok', expires_in: 3600 }) }) } } };
  return email;
}
function mockDrive(state: { content: string; rev: number; status?: number; email?: string; mime?: string }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = String(input);
    if (url.includes('userinfo')) return new Response(JSON.stringify({ email: state.email ?? 'me@example.com', email_verified: true }));
    if (state.status) return new Response('', { status: state.status });
    if (url.includes('alt=media')) return new Response(state.content);
    return new Response(JSON.stringify({ id: 'private-file-123', name: 'b.json', mimeType: state.mime ?? 'application/json', md5Checksum: `m${state.rev}`, headRevisionId: `r${state.rev}` }));
  });
}
function panel() {
  const store = makeStore(initialState()); const onAvailable = vi.fn();
  const view = render(<Provider store={store}><DriveBankPanel open close={() => undefined} onAvailable={onAvailable} /></Provider>);
  return { store, onAvailable, view, user: userEvent.setup() };
}
const media = (f: ReturnType<typeof mockDrive>) => f.mock.calls.filter(c => String(c[0]).includes('alt=media')).length;
async function connect(user: ReturnType<typeof userEvent.setup>) {
  const b = await screen.findByRole('button', { name: 'اتصال Google Drive' }); await waitFor(() => expect((b as HTMLButtonElement).disabled).toBe(false)); await user.click(b);
}

describe('Drive bank panel', () => {
  it('is RTL Persian, has a polite status region and no manual config inputs', () => {
    mockGoogle(); mockDrive({ content: '', rev: 1 }); panel();
    const region = screen.getByRole('region', { name: 'بانک Google Drive' }); expect(region.getAttribute('dir')).toBe('rtl'); expect(region.getAttribute('lang')).toBe('fa');
    expect(within(region).getByRole('status').getAttribute('aria-live')).toBe('polite'); expect(within(region).queryAllByRole('textbox')).toHaveLength(0);
  });
  it('rejects a non-project Google account and keeps disconnected', async () => {
    mockGoogle(); mockDrive({ content: BANK(), rev: 1, email: 'other@example.com' }); const { user } = panel(); await connect(user);
    expect(await screen.findByText(/حساب شخصی تعیین‌شدهٔ پروژه نیست/)).toBeTruthy(); expect(screen.queryByRole('button', { name: 'انتخاب فایل بانک' })).toBeNull();
  });
  it('downloads once, then polls metadata only until it changes', async () => {
    mockGoogle(); const drive = { content: BANK(), rev: 1 }; const f = mockDrive(drive); const { user, onAvailable } = panel();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await connect(user); expect(await screen.findByText(/2 سؤال آماده است/)).toBeTruthy(); expect(onAvailable).toHaveBeenLastCalledWith(true);
    const n = media(f);
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); }); await waitFor(() => expect(f.mock.calls.length).toBeGreaterThan(3)); expect(media(f)).toBe(n);
    drive.content = BANK('1+5', 'v2'); drive.rev = 2;
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); }); expect(await screen.findByText(/نسخهٔ v2/)).toBeTruthy(); expect(media(f)).toBe(n + 1);
  });
  it('a broken update keeps the previous bank and says so', async () => {
    mockGoogle(); const drive = { content: BANK(), rev: 1 }; mockDrive(drive); const { user } = panel(); await connect(user); await screen.findByText(/2 سؤال/);
    drive.content = BANK('x_1', 'v2'); drive.rev = 2; await user.click(screen.getByRole('button', { name: 'بررسی الان' }));
    expect(await screen.findByText(/Unsupported input near _1.*نسخهٔ قبلی دریافت‌شده و جلسهٔ فعلی دست نخورد/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'بازکردن دستهٔ دریافت‌شده' })).toBeTruthy();
  });
  it('shows Google Doc and 403 errors in Persian', async () => {
    mockGoogle(); const drive = { content: BANK(), rev: 1, mime: 'application/vnd.google-apps.document' } as Parameters<typeof mockDrive>[0]; mockDrive(drive); const { user } = panel(); await connect(user);
    expect(await screen.findByText(/Google Doc است/)).toBeTruthy();
    drive.mime = undefined; drive.status = 403; await user.click(screen.getByRole('button', { name: 'بررسی الان' })); expect(await screen.findByText(/۴۰۳/)).toBeTruthy();
  });
  it('401 expires the connection', async () => {
    mockGoogle(); const drive = { content: BANK(), rev: 1 } as Parameters<typeof mockDrive>[0]; mockDrive(drive); const { user } = panel(); await connect(user); await screen.findByText(/2 سؤال/);
    drive.status = 401; await user.click(screen.getByRole('button', { name: 'بررسی الان' }));
    expect(await screen.findByText(/منقضی/)).toBeTruthy(); expect(screen.getByRole('button', { name: 'اتصال دوباره' })).toBeTruthy(); expect(screen.queryByRole('button', { name: 'بررسی الان' })).toBeNull();
  });
  it('opening the bank archives the old session and the same version cannot be reopened', async () => {
    mockGoogle(); vi.spyOn(window, 'confirm').mockReturnValue(true); mockDrive({ content: BANK(), rev: 1 }); const { user, store, onAvailable } = panel(); await connect(user);
    const open = await screen.findByRole('button', { name: 'بازکردن دستهٔ دریافت‌شده' }); await user.click(open);
    expect(store.getState().doc.exercises.map(e => e.bankQuestionId)).toEqual(['A', 'B']); expect(onAvailable).toHaveBeenLastCalledWith(false);
    expect(await screen.findByText(/جلسه‌های ذخیره‌شده \(1\)/)).toBeTruthy();
  });
  it('cancelling the confirm leaves the session untouched', async () => {
    mockGoogle(); vi.spyOn(window, 'confirm').mockReturnValue(false); mockDrive({ content: BANK(), rev: 1 }); const { user, store } = panel(); await connect(user);
    const before = JSON.stringify(store.getState().doc); await user.click(await screen.findByRole('button', { name: 'بازکردن دستهٔ دریافت‌شده' })); expect(JSON.stringify(store.getState().doc)).toBe(before);
  });
  it('remembers the picked file id only', async () => {
    mockGoogle(); mockDrive({ content: '', rev: 1 }); const { user } = panel(); await connect(user); await screen.findByText(/هنوز خالی است/);
    expect(JSON.parse(localStorage.getItem('math-scratchpad-drive-config-v1')!)).toEqual({ fileId: 'private-file-123', fileName: 'MATH_QUESTION_BANK.json' });
  });
  it('store actions used by the panel: load replaces doc', () => { const s = makeStore(initialState()); const doc = bankDocument(validateBank(JSON.parse(BANK())), 'x'); s.dispatch(actions.load({ doc })); expect(s.getState().doc.session?.bankId).toBe('GEN'); });
});
