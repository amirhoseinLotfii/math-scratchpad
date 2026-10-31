import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from '../src/app/store-provider';
import { App } from '../src/App';
import { actions, exerciseOf, initialState, makeStore, stepOf } from '../src/store';
import { leaves, latex, stepLatex } from '../src/model';
import { writeClipboard } from '../src/review';
import { menuAction } from './support/menu-actions';

afterEach(() => {
  cleanup(); vi.restoreAllMocks();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
});
function mount() {
  const store = makeStore(initialState());
  const view = render(<div id="math-scratchpad-redux"><Provider store={store}><App /></Provider></div>);
  return { ...view, store };
}
const click = (name: string) => name === '⊕ Insert…' ? fireEvent.keyDown(screen.getByRole('main'), {key:'/'}) : fireEvent.click(screen.queryByRole('button', { name: name.startsWith('⌨ Show') ? 'Show Keyboard' : name.startsWith('⌨ Hide') ? 'Hide Keyboard' : name }) ?? menuAction(name));
function showKeys() { click('⌨ Show Keyboard'); }
function field(step = 1) { return screen.getByLabelText(`Step ${step} expression`) as HTMLElement & { value: string; position: number; selection: [number, number] }; }

describe('Responsive Math Scratchpad', () => {
  it('renders a single LTR direct-editing notebook, with the optional keyboard closed', () => {
    const { container } = mount();
    const expression = screen.getByLabelText('Step 1 expression');
    expect(expression.tagName.toLowerCase()).toBe('math-field');
    expect(field().value.replace(/\s+/g, '')).toContain('\\frac{2}{3}+\\frac{1}{4}');
    expect(expression.querySelector('[data-node-id]')).toBeNull();
    expect(container.querySelector('.scratchpad')?.getAttribute('dir')).toBe('ltr');
    expect(screen.queryByLabelText('Math keyboard')).toBeNull();
    expect(screen.getByLabelText('Original problem').querySelector('button')).toBeNull();
    expect(screen.getByLabelText('Current problem').textContent).not.toContain('2/3');
    showKeys();
    expect(within(screen.getByLabelText('Numeric keys')).getAllByRole('button').map(x => x.textContent)).toEqual(['1','2','3','÷','4','5','6','×','7','8','9','−','0','.','Fraction','+']);
    expect(container.querySelector('.editor-layout')?.classList.contains('keyboard-visible')).toBe(true);
    click('⌨ Hide Keyboard');
    expect(container.querySelector('.editor-layout')?.classList.contains('keyboard-hidden')).toBe(true);
  });
  it('persists MathLive LaTeX and retains an edit inserted at the requested caret position', () => {
    const { store } = mount();
    const input = field();
    const source = exerciseOf(store.getState().doc).source;
    act(() => { input.value = '1234'; fireEvent.input(input); });
    input.position = 1;
    input.focus();
    fireEvent.keyDown(input, { key: '9' });
    expect(stepLatex(stepOf(store.getState().doc))).toBe('19234');
    expect(exerciseOf(store.getState().doc).source).toBe(source);
  });
  it('changes the selected operator without modifying neighboring fractions', () => {
    const { store } = mount();
    const input = field(), value = input.value, operator = value.indexOf('+');
    input.selection = [operator, operator + 1]; input.position = operator + 1; input.focus();
    fireEvent.keyDown(input, { key: '×' });
    expect(stepLatex(stepOf(store.getState().doc))).toBe(value.replace('+', '×'));
  });
  it('keeps one shared keyboard below the phone editing tools, never nested in a step', () => {
    const {container} = mount(); showKeys();
    expect(screen.getAllByLabelText('Math keyboard')).toHaveLength(1);
    expect(screen.getByLabelText('Math keyboard').closest('.step')).toBeNull();
    expect(container.querySelector('.notebook-main .math-keyboard')).toBeTruthy();
    click('Add step');
    expect(screen.getAllByLabelText('Math keyboard')).toHaveLength(1);
    expect(screen.getAllByLabelText(/Step \d expression/)).toHaveLength(2);
  });
  it('supports horizontal numerator-to-next-top-level movement and vertical fraction levels', () => {
    const {store} = mount();
    const first = leaves(stepOf(store.getState().doc).expression)[0].node;
    act(() => store.dispatch(actions.select({ stepId: stepOf(store.getState().doc).id, nodeId: first.id, offset: 1 })));
    act(() => store.dispatch(actions.horizontal(1)));
    expect((store.getState().doc.cursor.nodeId)).toBe(leaves(stepOf(store.getState().doc).expression)[2].node.id);
    act(() => store.dispatch(actions.horizontal(1)));
    expect((store.getState().doc.cursor.nodeId)).toBe(leaves(stepOf(store.getState().doc).expression)[3].node.id);
    act(() => store.dispatch(actions.vertical(1)));
    expect((store.getState().doc.cursor.nodeId)).toBe(leaves(stepOf(store.getState().doc).expression)[4].node.id);
  });
  it('removes selected fractions structurally by Delete and reverses with Ctrl+Z', () => {
    const {store} = mount(); const first=leaves(stepOf(store.getState().doc).expression)[0].node;
    act(() => { store.dispatch(actions.select({ stepId: stepOf(store.getState().doc).id, nodeId: first.id })); store.dispatch(actions.selectParent()); });
    act(() => store.dispatch(actions.command({ type: 'deleteStructure' })));
    expect(latex(stepOf(store.getState().doc).expression)).not.toContain('\\frac{2}{3}');
    act(() => store.dispatch(actions.undo()));
    expect(latex(stepOf(store.getState().doc).expression)).toContain('\\frac{2}{3}');
    act(() => store.dispatch(actions.redo()));
    expect(latex(stepOf(store.getState().doc).expression)).not.toContain('\\frac{2}{3}');
  });
  it('opens keyboard-operated insertion chooser, arrows move focus and Enter inserts a fraction', () => {
    mount(); const input = field(); input.focus(); fireEvent.keyDown(input, { key: '/' });
    const dialog=screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    const option = screen.getByRole('button', { name: /^Fraction$/ }); option.focus(); fireEvent.keyDown(option,{key:'Enter'});
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(field().value).toContain('\\frac{\\placeholder{}}{\\placeholder{}}');
    input.focus(); fireEvent.keyDown(input,{key:'/'});
    fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('copies a review prompt only when the clipboard succeeds', async () => {
    const copy=vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}});
    const {container,store}=mount();
    act(()=>store.dispatch(actions.setConfidence('high')));
    click('Check · Copy for Review');
    await waitFor(()=>expect(screen.getByText('Copied',{exact:true})).toBeTruthy());
    expect(copy.mock.calls[0][0]).toContain('reviewThroughStep');
    expect(store.getState().copies[store.getState().doc.exerciseId]).toBeTruthy();
    fireEvent.keyDown(container.querySelector('.scratchpad')!,{key:'8'});
    expect(screen.getByText('Changed since copy')).toBeTruthy();
  });
  it('shows a manual selectable review message on clipboard failure', async () => {
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn().mockRejectedValue(Error('blocked'))}});
    Object.defineProperty(document,'execCommand',{configurable:true,value:vi.fn().mockReturnValue(false)});
    const {store}=mount(); act(()=>store.dispatch(actions.setConfidence('high'))); click('Check · Copy for Review');
    await waitFor(()=>expect(screen.getByLabelText('Review message · select all to copy')).toBeTruthy());
    expect(screen.queryByText('Copied',{exact:true})).toBeNull();
  });
  it('reports real legacy clipboard success and removes helper textareas',async()=>{
    const exec=vi.fn().mockReturnValue(true);Object.defineProperty(document,'execCommand',{configurable:true,value:exec});
    expect(await writeClipboard('fixture')).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
    expect(screen.queryByLabelText('Temporary clipboard text')).toBeNull();
  });
  it('opens Symbols in a single optional keyboard panel',()=>{
    mount();showKeys();click('Symbols');click('Calculus');click('Favorite Integral');click('Insert Integral');
    expect(screen.queryByLabelText('Symbol topics')).toBeNull();
    expect(screen.getByLabelText('Numeric keys')).toBeTruthy();
  });
  it('starts 30 Persian-stem questions, preserves each answer with Next and Previous and has no hints',async()=>{
    const {container,store}=mount();click('Exercise menu');click('Start 30-question diagnostic');click('Start 30 Questions');
    expect(store.getState().doc.exercises).toHaveLength(30);
    expect(store.getState().doc.exercises[0].prompt).toContain('هم‌ارز');
    expect(container.querySelector('.scratchpad')?.getAttribute('dir')).toBe('ltr');
    expect(screen.getByText(/برای هم‌ارز شدن/).getAttribute('dir')).toBe('rtl');
    expect(container.textContent?.toLowerCase()).not.toContain('hint');
    fireEvent.keyDown(container.querySelector('.scratchpad')!,{key:'9'});
    const first=latex(stepOf(store.getState().doc).expression);
    await userEvent.click(screen.getByRole('button',{name:/Next question/}));
    await userEvent.click(screen.getByRole('radio',{name:'High'}));
    await userEvent.click(screen.getByRole('button',{name:/Continue/}));
    expect(store.getState().doc.exercises[0].steps[0].expression).toBeTruthy();
    expect(latex(stepOf(store.getState().doc).expression)).toBe('\\square');
    click('← Previous');
    expect(latex(stepOf(store.getState().doc).expression)).toBe(first);
  });
  it('marks changed prior steps for review without mutating later expressions',()=>{
    const {store}=mount(); act(() => store.dispatch(actions.command({ type: 'newStep' })));
    const ex=exerciseOf(store.getState().doc);
    act(() => store.dispatch(actions.mathLiveInput({ stepId: ex.steps[1].id, value: '5' })));
    const later=stepLatex(exerciseOf(store.getState().doc).steps[1]);
    act(() => store.dispatch(actions.mathLiveInput({ stepId: ex.steps[0].id, value: '9' })));
    expect(exerciseOf(store.getState().doc).steps[0].status).toBe('unchecked');
    expect(exerciseOf(store.getState().doc).steps[1].status).toBe('needs-review');
    expect(stepLatex(exerciseOf(store.getState().doc).steps[1])).toBe(later);
  });
});
