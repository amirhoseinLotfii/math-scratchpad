import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { Provider } from '../../../src/app/store-provider';
import { DriveBankPanel } from '../../../src/features/drive-bank/drive-bank-panel';
import { snapshotVersion, validateBank } from '../../../src/features/drive-bank/drive-bank';
import { resetOfflineBankCacheForTests, saveOfflineBank } from '../../../src/pwa/offline-bank-cache';
import { initialState, makeStore } from '../../../src/store';

afterEach(async () => {
  cleanup();
  await resetOfflineBankCacheForTests();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('cached offline bank panel', () => {
  it('lists a verified cached bank and opens it locally without starting a cloud transition', async () => {
    const bank = validateBank({
      schema_version: 'math-scratchpad.bank/1.0',
      bank_id: 'offline-chapter-a',
      version: 'v1',
      questions: [{ id: 'Q01', mode: 'math', source: '1+2' }],
      chapter: { id: 'chapter-1', number: 1, title: 'Chapter 1', source: 'Synthetic', pdfPages: '1', lessonIds: [] },
    });
    await saveOfflineBank('offline-file-a', bank, await snapshotVersion(bank), 'synthetic-fingerprint');
    const store = makeStore(initialState());
    const cloudTransition = vi.fn(async () => undefined);
    const user = userEvent.setup();

    render(
      <Provider store={store}>
        <DriveBankPanel open close={() => undefined} onAvailable={() => undefined} onBeforeBankLoad={cloudTransition} />
      </Provider>,
    );

    expect(await screen.findByText(/نسخهٔ ذخیره‌شده/)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Open offline bank offline-chapter-a' }));
    await user.click(await screen.findByRole('button', { name: 'Open bank' }));

    expect(store.getState().doc.session?.bankId).toBe('offline-chapter-a');
    expect(store.getState().doc.exercises[0]?.bankQuestionId).toBe('Q01');
    expect(cloudTransition).not.toHaveBeenCalled();
    expect(await screen.findByText(/Offline bank offline-chapter-a is ready/)).toBeInTheDocument();
  });
});
