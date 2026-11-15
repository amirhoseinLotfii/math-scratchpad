import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Provider } from '../../src/app/store-provider';
import { App, INSERT_VISIBLE } from '../../src/app/app';
import { actions, exerciseOf, initialState, makeStore } from '../../src/store';
import { latex } from '../../src/model';
import { bankDocument, validateBank } from '../../src/features/drive-bank/drive-bank';
import { UI_PREFS_PREFIX } from '../../src/shared/lib/ui-prefs';

function viewport(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    matches: width >= Number(query.match(/min-width:\s*(\d+)/)?.[1] ?? Infinity),
    addEventListener() {},
    removeEventListener() {},
  }));
}
function mount({
  width = 1920,
  store = (() => {
    const s = makeStore(initialState());
    s.dispatch(actions.startFractionRound());
    return s;
  })(),
} = {}) {
  viewport(width);
  const view = render(
    <div id="math-scratchpad-redux">
      <Provider store={store}>
        <App />
      </Provider>
    </div>,
  );
  return { store, user: userEvent.setup(), ...view };
}
const BANK = {
  schema_version: 'math-scratchpad.bank/1.0',
  bank_id: 'T',
  version: 'v1',
  questions: [
    { id: 'G1', mode: 'math', source: '1+2', guidance: 'به ترتیب عملیات فکر کن.' },
    { id: 'N1', mode: 'text', source: 'متن' },
  ],
};
function bankStore() {
  const s = makeStore(initialState());
  s.dispatch(actions.load({ doc: bankDocument(validateBank(BANK), 'v1-x') }));
  return s;
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (globalThis as { __askWellbeing?: boolean }).__askWellbeing;
});

describe('1–2 persisted panels', () => {
  it('Questions panel collapses with an accessible toggle and stays collapsed across navigation and remount', async () => {
    const { user, store, unmount } = mount();
    const nav = screen.getByRole('navigation', { name: 'Questions' });
    const toggle = within(nav).getByRole('button', { name: 'Collapse questions panel' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle);
    expect(nav.querySelector('ol')).not.toBeVisible();
    expect(localStorage.getItem(UI_PREFS_PREFIX + 'questions')).toBe('0');
    act(() => {
      store.dispatch(actions.adjacentExercise(1));
    });
    expect(within(nav).getByRole('button', { name: 'Expand questions panel' })).toHaveAttribute('aria-expanded', 'false');
    unmount();
    mount();
    expect(screen.getByRole('button', { name: 'Expand questions panel' })).toBeInTheDocument();
  });
  it('keeps session details in the expanded menu and puts shortcuts under Help', async () => {
    const { user } = mount();
    expect(screen.queryByText('Session details')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Keyboard shortcuts' })).toBeNull();
    expect(document.querySelector('.session-panel')).toBeNull();
    expect(screen.getByLabelText('Question elapsed time')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Exercise menu' }));
    expect(screen.queryByRole('menuitem', { name: 'Session details' })).toBeNull();
    await user.click(screen.getByRole('menuitem', { name: 'Show more' }));
    await user.click(screen.getByRole('menuitem', { name: 'Session details' }));
    const sessionDetails = screen.getByRole('group', { name: 'Session details' });
    expect(within(sessionDetails).getByText('Session ID')).toBeInTheDocument();
    expect(within(sessionDetails).getByText('Math anxiety')).toBeInTheDocument();
    expect(within(sessionDetails).getByText('Energy')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Exercise menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Show more' }));
    await user.click(screen.getByRole('menuitem', { name: 'Keyboard shortcuts' }));
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(localStorage.getItem(UI_PREFS_PREFIX + 'session-details')).toBeNull();
  });
  it('still works in memory when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: 'Collapse questions panel' }));
    expect(screen.getByRole('button', { name: 'Expand questions panel' })).toBeInTheDocument();
  });
});

describe('3 confidence dialog focus', () => {
  it('focuses the dialog, not Low, and selects nothing', async () => {
    const { user } = mount({ width: 390 });
    await user.click(screen.getByRole('button', { name: /Next question/ }));
    const dialog = screen.getByRole('dialog', { name: /confidence/i });
    expect(document.activeElement).toBe(dialog);
    expect(within(dialog).getByRole('radio', { name: 'Low' })).not.toHaveFocus();
    for (const r of within(dialog).getAllByRole('radio')) expect(r).not.toBeChecked();
    await user.tab();
    expect(within(dialog).getByRole('radio', { name: 'Low' })).toHaveFocus();
    expect(within(dialog).getByRole('radio', { name: 'Low' })).not.toBeChecked();
  });
});

describe('4 Enter creates a step', () => {
  it('Enter in the editor adds and focuses a blank step; Alt+Enter still marks Final', async () => {
    const { store } = mount();
    const main = screen.getByRole('main');
    fireEvent.keyDown(main, { key: '5' });
    fireEvent.keyDown(main, { key: 'Enter', altKey: true });
    expect(exerciseOf(store.getState().doc).steps[0].final).toBe(true);
    expect(exerciseOf(store.getState().doc).steps).toHaveLength(1);
    fireEvent.keyDown(main, { key: 'Enter' });
    const ex = exerciseOf(store.getState().doc);
    expect(ex.steps).toHaveLength(2);
    expect(store.getState().doc.cursor.stepId).toBe(ex.steps[1].id);
    expect(latex(ex.steps[1].expression)).toBe('\\square');
    await waitFor(() => expect(screen.getByLabelText('Step 2 expression')).toHaveFocus());
    fireEvent.keyDown(main, { key: 'z', ctrlKey: true });
    expect(exerciseOf(store.getState().doc).steps).toHaveLength(1);
  });
  it('Enter on buttons, selects and dialogs is not intercepted', async () => {
    const { store, user } = mount({ width: 1440 });
    fireEvent.keyDown(
      within(screen.getByRole('navigation', { name: 'Questions' })).getByRole('button', { name: 'Question 1 Not started' }),
      { key: 'Enter' },
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Add step' }), { key: 'Enter' });
    expect(exerciseOf(store.getState().doc).steps).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'More math tools' }));
    const d = screen.getByRole('dialog', { name: 'Insert Math Element' });
    fireEvent.keyDown(within(d).getAllByRole('button')[0], { key: 'Enter' });
    expect(exerciseOf(store.getState().doc).steps).toHaveLength(1);
  });
});

describe('5 insert dialog “Show more”', () => {
  it('shows 8 tools, expands to the full catalog, collapses again; arrows stay within visible tools', async () => {
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: 'More math tools' }));
    const d = screen.getByRole('dialog', { name: 'Insert Math Element' }),
      tools = () => d.querySelectorAll('[data-insert-kind]');
    expect(tools()).toHaveLength(INSERT_VISIBLE);
    expect(INSERT_VISIBLE).toBeGreaterThanOrEqual(6);
    expect(INSERT_VISIBLE).toBeLessThanOrEqual(8);
    expect(tools()[0]).toHaveFocus();
    fireEvent.keyDown(tools()[0], { key: 'ArrowLeft' });
    expect(tools()[INSERT_VISIBLE - 1]).toHaveFocus();
    const more = within(d).getByRole('button', { name: /Show more/ });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    expect(tools().length).toBeGreaterThan(INSERT_VISIBLE);
    expect(within(d).getByRole('button', { name: 'Integral' })).toBeInTheDocument();
    await user.click(within(d).getByRole('button', { name: 'Show fewer' }));
    expect(tools()).toHaveLength(INSERT_VISIBLE);
  });
  it('phone also gets a collapsed list with the full catalog reachable', async () => {
    const { user } = mount({ width: 390 });
    fireEvent.keyDown(screen.getByRole('main'), { key: '/' });
    const d = screen.getByRole('dialog', { name: 'Insert Math Element' });
    expect(d.querySelectorAll('[data-insert-kind]')).toHaveLength(INSERT_VISIBLE);
    await user.click(within(d).getByRole('button', { name: /Show more/ }));
    expect(d.querySelectorAll('[data-insert-kind]')).toHaveLength(10);
  });
});

describe('6 header progress', () => {
  it('separates answered from skipped and updates immediately', () => {
    const { store } = mount();
    const header = () => document.querySelector('.header-progress-copy')!.textContent;
    expect(header()).toBe('0 of 20 practice questions answered');
    act(() => {
      store.dispatch(actions.command({ type: 'digit', value: '4' }));
    });
    expect(header()).toBe('0 of 20 practice questions answered'); // draft is not answered
    act(() => {
      store.dispatch(actions.setConfidence('low'));
    });
    expect(header()).toBe('1 of 20 practice questions answered');
    act(() => {
      store.dispatch(actions.adjacentExercise(1));
      store.dispatch(actions.setSkipped(true));
    });
    expect(header()).toBe('1 of 20 practice questions answered · 1 skipped');
  });
});
