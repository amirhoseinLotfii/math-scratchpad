import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { App } from '../src/App';
import { actions, exerciseOf, initialState, makeStore, stepOf } from '../src/store';
import { leaves, latex } from '../src/model';
import { writeClipboard } from '../src/review';
afterEach(() => { cleanup(); vi.restoreAllMocks(); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }); });
function mount() { const store = makeStore(initialState()); const view = render(<div id="math-scratchpad-redux"><Provider store={store}><App /></Provider></div>); return { ...view, store }; }
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true }));
describe('Real React interface', () => {
  it('renders LTR tokens in the required visual DOM order, English labels and standard keys', () => {
    const { container, store } = mount(); const expression = screen.getByLabelText('Step 1 expression');
    expect([...expression.querySelectorAll('[data-node-id]')].map(x => x.textContent)).toEqual(['2', '3', '+', '1', '4']);
    expect(container.querySelector('.scratchpad')?.getAttribute('dir')).toBe('ltr'); expect(container.textContent).not.toMatch(/[\u0600-\u06ff]/);
    for (const token of expression.querySelectorAll<HTMLButtonElement>('[data-node-id]')) { fireEvent.click(token); expect(store.getState().doc.cursor.nodeId).toBe(token.dataset.nodeId); }
    expect(within(screen.getByLabelText('Numeric keys')).getAllByRole('button').map(x => x.textContent)).toEqual(['1', '2', '3', '÷', '4', '5', '6', '×', '7', '8', '9', '−', '0', '.', '=', '+']);
  });
  it('places caret by measured digit midpoint on a touched number', () => {
    const { store } = mount(); store.dispatch(actions.command({ type: 'clear' })); for (const value of '123') store.dispatch(actions.command({ type: 'digit', value }));
    // Dispatches outside act are avoided by rerendering through a React event first.
    click('Hide keys'); click('Show keys');
    const token = screen.getByRole('button', { name: 'Step 1 number 123', exact: true });
    token.querySelectorAll<HTMLElement>('[data-digit]').forEach((span, i) => { span.getBoundingClientRect = () => ({ left: 100 + i * 20, width: 20 } as DOMRect); });
    fireEvent.click(token, { clientX: 122, detail: 1 }); expect(store.getState().doc.cursor.offset).toBe(1); click('9'); expect(latex(stepOf(store.getState().doc).expression)).toBe('1923');
  });
  it('changes the selected operator and the neighboring fraction remains unchanged', () => {
    const { store } = mount(); click('Step 1 operator +'); click('×'); expect(latex(stepOf(store.getState().doc).expression)).toBe('\\frac{2}{3}\\times \\frac{1}{4}');
  });
  it('keeps one keyboard adjacent to the active step, opens on touch and shows all lines', () => {
    const { container, store } = mount(); click('+ New step'); click('5');
    expect(screen.getAllByLabelText('Math keyboard')).toHaveLength(1); expect(screen.getAllByLabelText(/Step \d expression/)).toHaveLength(2);
    const first = exerciseOf(store.getState().doc).steps[0]; fireEvent.click(container.querySelector(`[data-node-id="${leaves(first.expression)[0].node.id}"]`)!);
    expect(screen.getByLabelText('Math keyboard').closest('[data-step-id]')?.getAttribute('data-step-id')).toBe(first.id);
    click('Hide keys'); expect(screen.queryByLabelText('Math keyboard')).toBeNull(); fireEvent.click(container.querySelector(`[data-node-id="${leaves(first.expression)[1].node.id}"]`)!); expect(screen.getByLabelText('Math keyboard')).toBeTruthy();
  });
  it('copies full prompt on Check and changes the badge only after actual success and editing', async () => {
    const copy = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
    const { store } = mount(); click('Check'); await waitFor(() => expect(screen.getByText('Copied', { exact: true })).toBeTruthy());
    expect(copy).toHaveBeenCalledTimes(1); expect(copy.mock.calls[0][0]).toContain('reviewThroughStep'); expect(copy.mock.calls[0][0]).toContain('domain restrictions'); expect(store.getState().copies[store.getState().doc.exerciseId]).toBeTruthy();
    click('8'); expect(screen.getByText('Changed since copy')).toBeTruthy(); click('Undo'); expect(screen.getByText('Copied', { exact: true })).toBeTruthy();
  });
  it('shows manual selectable text on clipboard failure without saying Copied', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(Error('blocked')) } });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) });
    mount(); click('Check'); await waitFor(() => expect(screen.getByLabelText('Review message · long-press to copy')).toBeTruthy());
    expect(screen.queryByText('Copied', { exact: true })).toBeNull(); expect((screen.getByLabelText('Review message · long-press to copy') as HTMLTextAreaElement).value).toContain('math-scratchpad-review');
  });
  it('uses legacy clipboard only when it actually succeeds, and removes its temporary textarea', async () => {
    const exec = vi.fn().mockReturnValue(true); Object.defineProperty(document, 'execCommand', { configurable: true, value: exec });
    expect(await writeClipboard('review fixture')).toBe(true); expect(exec).toHaveBeenCalledWith('copy'); expect(screen.queryByLabelText('Temporary clipboard text')).toBeNull();
  });
  it('creates a new exercise from the expression with the old steps preserved', () => {
    const { store } = mount(); click('Exercise menu'); click('Use this expression as a new problem'); expect(store.getState().doc.exercises).toHaveLength(2); expect(latex(stepOf(store.getState().doc).expression)).toBe('\\square');
  });
  it('opens topic symbols, saves a favorite and returns to numeric keys after insertion', () => {
    mount(); click('Symbols'); click('Calculus'); click('Favorite Integral'); click('Insert Integral'); expect(screen.queryByLabelText('Symbol topics')).toBeNull(); expect(screen.getByLabelText('Numeric keys')).toBeTruthy(); expect(screen.getByRole('button', { name: 'Insert favorite Integral' })).toBeTruthy();
  });
});


describe('Image-inspired notebook interaction', () => {
  it('renders the problem as noninteractive math without changing the editing selection', () => {
    const { store } = mount(); const before = store.getState().doc.cursor;
    const problem = screen.getByLabelText('Original problem');
    expect([...problem.querySelectorAll('.readonly-token')].map(n => n.textContent)).toEqual(['2', '3', '+', '1', '4']);
    expect(problem.querySelector('button')).toBeNull();
    expect(store.getState().doc.cursor).toEqual(before);
  });
  it('previews a notation template without inserting it until requested', () => {
    const { store } = mount(); const original = latex(stepOf(store.getState().doc).expression);
    click('Symbols'); click('Calculus');
    const preview = screen.getByLabelText('Editable template preview');
    expect(preview.querySelector('.large-glyph')?.textContent).toBe('∫');
    expect(preview.querySelector('[data-node-id]')).toBeNull();
    expect(latex(stepOf(store.getState().doc).expression)).toBe(original);
    click('Insert template');
    expect(latex(stepOf(store.getState().doc).expression)).toContain('\\int_');
    expect(screen.queryByLabelText('Symbol topics')).toBeNull();
  });
  it('shows an Edited badge only for changed math and preserves later lines', () => {
    const { container, store } = mount(); click('+ New step'); click('5');
    const ex = exerciseOf(store.getState().doc); const later = latex(ex.steps[1].expression);
    fireEvent.click(container.querySelector(`[data-node-id="${leaves(ex.steps[0].expression)[0].node.id}"]`)!);
    click('9');
    expect(container.querySelector(`[data-step-id="${ex.steps[0].id}"] .step-state`)?.textContent).toBe('Edited');
    expect(container.querySelector(`[data-step-id="${ex.steps[1].id}"] .step-state`)?.textContent).toBe('Needs review');
    expect(latex(exerciseOf(store.getState().doc).steps[1].expression)).toBe(later);
  });
  it('labels whole-structure editing while keeping the fraction intact', () => {
    const { container } = mount(); click('Structure');
    expect(screen.getByText('Whole structure selected')).toBeTruthy();
    expect(container.querySelector('.structure-selected .fraction')).toBeTruthy();
    click('Copy'); click('Duplicate');
    expect(container.querySelectorAll('[aria-label="Step 1 expression"] .fraction')).toHaveLength(3);
  });
});
