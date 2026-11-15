import { mockGoogle, mockDrive, panel, connect } from './drive-bank-ui-fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { actions, initialState, makeStore } from '../../src/store';
import { bankDocument, validateBank } from '../../src/features/drive-bank/drive-bank';
import { clearDriveSessionToken } from '../../src/features/drive-bank/google';
import { clearGoogleIdToken } from '../../src/sync/google-id-token';
import { resetWorkerSessionForTests } from '../../src/sync/worker-session';
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

describe('Drive bank session controls', () => {
  it('opening the bank archives the old session and the same version cannot be reopened', async () => {
    mockGoogle();
    mockDrive({ content: BANK(), rev: 1 });
    const { user, store, onAvailable } = panel();
    const originalSessionId = store.getState().doc.session?.id;
    await connect(user);
    const open = await screen.findByRole('button', { name: 'Open received batch' });
    await user.click(open);
    const batchDialog = await screen.findByRole('dialog', { name: 'Open a new question batch?' });
    expect(within(batchDialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(batchDialog).getByRole('button', { name: 'Open batch' }));
    expect(store.getState().doc.exercises.map((e) => e.bankQuestionId)).toEqual(['A', 'B']);
    expect(onAvailable).toHaveBeenLastCalledWith(false);
    expect(await screen.findByText(/Saved sessions \(1\)/)).toBeTruthy();
    await user.click(screen.getByText(/Saved sessions \(1\)/));
    const resume = screen.getByRole('button', { name: 'Resume' });
    await user.click(resume);
    const restoreDialog = await screen.findByRole('dialog', { name: 'Restore this saved session?' });
    await user.click(within(restoreDialog).getByRole('button', { name: 'Cancel' }));
    expect(resume).toHaveFocus();
    expect(store.getState().doc.session?.bankId).toBe('GEN');
    await user.click(resume);
    await user.click(await screen.findByRole('button', { name: 'Restore session' }));
    expect(store.getState().doc.session?.id).toBe(originalSessionId);
  });
  it('cancelling the confirm leaves the session untouched', async () => {
    mockGoogle();
    mockDrive({ content: BANK(), rev: 1 });
    const { user, store } = panel();
    await connect(user);
    const before = JSON.stringify(store.getState().doc);
    const open = await screen.findByRole('button', { name: 'Open received batch' });
    await user.click(open);
    const dialog = await screen.findByRole('dialog', { name: 'Open a new question batch?' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(open).toHaveFocus();
    expect(JSON.stringify(store.getState().doc)).toBe(before);
  });
  it('remembers the picked file id only', async () => {
    mockGoogle();
    mockDrive({ content: '', rev: 1 });
    const { user } = panel();
    await connect(user);
    await screen.findByText(/selected bank file is empty/);
    expect(JSON.parse(localStorage.getItem('math-scratchpad-drive-config-v1')!)).toEqual({
      fileId: 'private-file-123',
      fileName: 'MATH_QUESTION_BANK.json',
    });
  });
  it('store actions used by the panel: load replaces doc', () => {
    const s = makeStore(initialState());
    const doc = bankDocument(validateBank(JSON.parse(BANK())), 'x');
    s.dispatch(actions.load({ doc }));
    expect(s.getState().doc.session?.bankId).toBe('GEN');
  });
});
