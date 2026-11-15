import { mockGoogle, mockDrive, panel, media, connect } from './drive-bank-ui-fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Provider } from '../../src/app/store-provider';
import { QuestionNavigator } from '../../src/features/workspace/components/question-navigator';
import { QuestionTimer } from '../../src/features/session/components/question-timer';
import { POLL_MS } from '../../src/features/drive-bank/drive-bank-panel';
import { actions, initialState, makeStore } from '../../src/store';
import { bankDocument, validateBank } from '../../src/features/drive-bank/drive-bank';
import { parse } from '../../src/parser';
import { clearDriveSessionToken } from '../../src/features/drive-bank/google';
import { clearGoogleIdToken } from '../../src/sync/google-id-token';
import { resetWorkerSessionForTests } from '../../src/sync/worker-session';
import userEvent from '@testing-library/user-event';
vi.mock('../../src/features/drive-bank/identity', () => ({
  permittedAccount: async (p: { email?: string }) => p?.email === 'me@example.com',
}));

const BANK = (source = '1+2', version = 'v1') =>
  JSON.stringify({
    schema_version: 'math-scratchpad.bank/1.0',
    bank_id: 'GEN',
    version,
    questions: [
      { id: 'A', mode: 'math', source },
      { id: 'B', mode: 'text', source: 'متن' },
    ],
  });
afterEach(async () => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  clearDriveSessionToken();
  clearGoogleIdToken();
  await resetWorkerSessionForTests();
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete window.google;
  delete window.gapi;
});

describe('question navigator', () => {
  it('shows per-question statuses and keyboard movement without duplicating header totals', async () => {
    const doc = bankDocument(validateBank(JSON.parse(BANK())), 'x');
    doc.exercises[0].steps[0].expression = parse('3');
    doc.exercises[0].confidence = 'high';
    doc.exercises[1].skipped = true;
    const onSelect = vi.fn();
    render(<QuestionNavigator doc={doc} onSelect={onSelect} />);
    expect(screen.queryByText(/of 2 answered/)).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    const buttons = screen.getAllByRole('button').filter((b) => b.classList.contains('question-destination'));
    expect(buttons[0].textContent).toContain('Answered');
    expect(buttons[1].textContent).toContain('Skipped');
    expect(buttons[0].getAttribute('aria-current')).toBe('page');
    const user = userEvent.setup();
    buttons[0].focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(buttons[1]);
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(buttons[0]);
    await user.click(buttons[1]);
    expect(onSelect).toHaveBeenCalledWith(doc.exercises[1].id);
  });
});

describe('question timer display', () => {
  it.each([
    [0, '00:00'],
    [999, '00:00'],
    [61000, '01:01'],
    [3599000, '59:59'],
    [3600000, '60:00'],
  ])('%i ms -> %s', (ms, text) => {
    vi.useFakeTimers();
    const store = makeStore(initialState());
    const ex = store.getState().doc.exercises[0];
    store.dispatch(actions.addQuestionTime({ exerciseId: ex.id, milliseconds: ms }));
    render(
      <Provider store={store}>
        <QuestionTimer exerciseId={ex.id} />
      </Provider>,
    );
    expect(screen.getByLabelText('Question elapsed time').textContent).toBe(text);
  });
  it('pause button toggles aria-pressed and label; direction is LTR', async () => {
    const store = makeStore(initialState());
    const { container } = render(
      <Provider store={store}>
        <QuestionTimer exerciseId={store.getState().doc.exercises[0].id} />
      </Provider>,
    );
    const b = screen.getByRole('button', { name: 'Pause' });
    expect(b.getAttribute('aria-pressed')).toBe('false');
    await userEvent.setup().click(b);
    expect(screen.getByRole('button', { name: 'Resume' }).getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.question-timer')?.getAttribute('dir')).toBe('ltr');
  });
});

describe('Drive bank panel', () => {
  it('uses English LTR app controls, a polite status region and no manual config inputs', () => {
    mockGoogle();
    mockDrive({ content: '', rev: 1 });
    panel();
    const region = screen.getByRole('dialog', { name: 'Google Drive question bank' });
    expect(region.getAttribute('dir')).toBe('ltr');
    expect(region.getAttribute('lang')).toBe('en');
    expect(within(region).getByRole('status').getAttribute('aria-live')).toBe('polite');
    expect(within(region).queryAllByRole('textbox')).toHaveLength(0);
  });
  it('rejects a non-project Google account and keeps disconnected', async () => {
    mockGoogle();
    mockDrive({ content: BANK(), rev: 1, email: 'other@example.com' });
    const { user } = panel();
    await connect(user);
    expect(await screen.findByText(/حساب Google Drive با حساب واردشده یکی نیست/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Choose bank file' })).toBeNull();
  });
  it('downloads once, then polls metadata only until it changes', async () => {
    mockGoogle();
    const drive = { content: BANK(), rev: 1 };
    const f = mockDrive(drive);
    const { user, onAvailable, onBankReady } = panel();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await connect(user);
    expect(await screen.findByText(/2 questions ready/)).toBeTruthy();
    expect(onAvailable).toHaveBeenLastCalledWith(true);
    expect(onBankReady.mock.lastCall?.[0]).toMatchObject({ bank_id: 'GEN' });
    const n = media(f);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    await waitFor(() => expect(f.mock.calls.length).toBeGreaterThan(3));
    expect(media(f)).toBe(n);
    drive.content = BANK('1+5', 'v2');
    drive.rev = 2;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(await screen.findByText(/version v2/)).toBeTruthy();
    expect(media(f)).toBe(n + 1);
  });
  it('a broken update keeps the previous bank and says so', async () => {
    mockGoogle();
    const drive = { content: BANK(), rev: 1 };
    mockDrive(drive);
    const { user } = panel();
    await connect(user);
    await screen.findByText(/2 questions/);
    drive.content = BANK('x_1', 'v2');
    drive.rev = 2;
    await user.click(screen.getByRole('button', { name: 'Check now' }));
    expect(await screen.findByText(/Unsupported input near _1.*previously loaded bank and current session were preserved/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open received batch' })).toBeTruthy();
  });
  it('warns when a fetched bank version differs from the active session', async () => {
    mockGoogle();
    mockDrive({ content: BANK(), rev: 1 });
    const { user, store } = panel();
    const doc = bankDocument(validateBank(JSON.parse(BANK())), 'v1-old');
    store.dispatch(actions.load({ doc }));
    const before = structuredClone(store.getState().doc);
    await connect(user);
    expect(await screen.findByText(/bank version differs from the current session.*current session was not changed/)).toBeTruthy();
    expect(store.getState().doc).toEqual(before);
  });
  it('explains that Learn progress is scoped by bank version even without an active bank session', async () => {
    mockGoogle();
    const raw = JSON.parse(BANK());
    raw.lessons = [{ id: 'L1', book: 'Sample', section: '1', title: 'Lesson', concepts: [] }];
    mockDrive({ content: JSON.stringify(raw), rev: 1 });
    const { user } = panel();
    await connect(user);
    expect(await screen.findByText(/Lesson progress is kept separately for each bank version/)).toBeTruthy();
  });
  it('shows Google Doc and 403 errors in English', async () => {
    mockGoogle();
    const drive = { content: BANK(), rev: 1, mime: 'application/vnd.google-apps.document' } as Parameters<typeof mockDrive>[0];
    mockDrive(drive);
    const { user } = panel();
    await connect(user);
    expect(await screen.findByText(/The bank file is a Google Doc/)).toBeTruthy();
    drive.mime = undefined;
    drive.status = 403;
    await user.click(screen.getByRole('button', { name: 'Check now' }));
    expect(await screen.findByText(/Google denied access \(403\)/)).toBeTruthy();
  });
  it('401 expires the connection', async () => {
    mockGoogle();
    const drive = { content: BANK(), rev: 1 } as Parameters<typeof mockDrive>[0];
    mockDrive(drive);
    const { user } = panel();
    await connect(user);
    await screen.findByText(/2 questions/);
    drive.status = 401;
    await user.click(screen.getByRole('button', { name: 'Check now' }));
    expect(await screen.findByText(/authorization expired/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Grant Google Drive access' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Check now' })).toBeNull();
  });
});
