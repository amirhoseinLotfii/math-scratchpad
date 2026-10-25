import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { App } from '../src/App';
import { actions, exerciseOf, initialState, makeStore, stepOf } from '../src/store';
import { leaves, latex } from '../src/model';
import { writeClipboard } from '../src/review';

afterEach(() => {
  cleanup(); vi.restoreAllMocks();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
});
function mount() {
  const store = makeStore(initialState());
  const view = render(<div id="math-scratchpad-redux"><Provider store={store}><App /></Provider></div>);
  return { ...view, store };
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true }));
function showKeys() { click('⌨ Show Keyboard'); }

describe('Responsive Math Scratchpad', () => {
  it('renders a single LTR direct-editing notebook, with the optional keyboard closed', () => {
    const { container } = mount();
    const expression = screen.getByLabelText('Step 1 expression');
    expect([...expression.querySelectorAll('[data-node-id]')].map(x => x.textContent)).toEqual(['2', '3', '+', '1', '4']);
    expect(container.querySelector('.scratchpad')?.getAttribute('dir')).toBe('ltr');
    expect(screen.queryByLabelText('Math keyboard')).toBeNull();
    expect(screen.getByLabelText('Original problem').querySelector('button')).toBeNull();
    expect(screen.getByLabelText('Current problem').textContent).not.toContain('2/3');
    showKeys();
    expect(within(screen.getByLabelText('Numeric keys')).getAllByRole('button').map(x => x.textContent)).toEqual(['1','2','3','÷','4','5','6','×','7','8','9','−','0','.','=','+']);
    expect(container.querySelector('.editor-layout')?.classList.contains('keyboard-visible')).toBe(true);
    click('⌨ Hide Keyboard');
    expect(container.querySelector('.editor-layout')?.classList.contains('keyboard-hidden')).toBe(true);
  });
  it('edits a specific digit by clicked position and retains caret editing', () => {
    const { container, store } = mount();
    act(() => {
      store.dispatch(actions.command({ type: 'clear' }));
      store.dispatch(actions.command({ type: 'digit', value: '1' }));
      store.dispatch(actions.command({ type: 'digit', value: '2' }));
      store.dispatch(actions.command({ type: 'digit', value: '3' }));
    });
    const token = screen.getByRole('button', { name: 'Step 1 number 123' });
    token.querySelectorAll<HTMLElement>('[data-digit]').forEach((span,i) => {
      span.getBoundingClientRect = () => ({ left: 100+i*20,width:20 } as DOMRect);
    });
    fireEvent.click(token, { clientX: 122, detail: 1 });
    fireEvent.keyDown(container.querySelector('.scratchpad')!, { key:'9' });
    expect(latex(stepOf(store.getState().doc).expression)).toBe('1923');
  });
  it('changes the selected operator without modifying neighboring fractions', () => {
    const { store } = mount(); click('Step 1 operator +');
    fireEvent.keyDown(screen.getByRole('button',{name:'Step 1 operator +'}),{key:'*'});
    expect(latex(stepOf(store.getState().doc).expression)).toContain('\\times ');
    expect(latex(stepOf(store.getState().doc).expression)).toContain('\\frac{2}{3}');
    expect(latex(stepOf(store.getState().doc).expression)).toContain('\\frac{1}{4}');
  });
  it('keeps one keyboard in a desktop sibling panel, not inside the steps', () => {
    const {container} = mount(); showKeys();
    expect(screen.getAllByLabelText('Math keyboard')).toHaveLength(1);
    expect(screen.getByLabelText('Math keyboard').closest('.step')).toBeNull();
    expect(container.querySelector('.keyboard-side')).toBeTruthy();
    click('+ New Step');
    expect(screen.getAllByLabelText('Math keyboard')).toHaveLength(1);
    expect(screen.getAllByLabelText(/Step \d expression/)).toHaveLength(2);
  });
  it('supports horizontal numerator-to-next-top-level movement and vertical fraction levels', () => {
    const {container,store} = mount();
    const first = leaves(stepOf(store.getState().doc).expression)[0].node;
    fireEvent.click(container.querySelector('[data-node-id="'+first.id+'"]')!);
    fireEvent.keyDown(container.querySelector('.scratchpad')!, {key:'ArrowRight'});
    expect((store.getState().doc.cursor.nodeId)).toBe(leaves(stepOf(store.getState().doc).expression)[2].node.id);
    fireEvent.keyDown(container.querySelector('.scratchpad')!, {key:'ArrowRight'});
    expect((store.getState().doc.cursor.nodeId)).toBe(leaves(stepOf(store.getState().doc).expression)[3].node.id);
    fireEvent.keyDown(container.querySelector('.scratchpad')!, {key:'ArrowDown'});
    expect((store.getState().doc.cursor.nodeId)).toBe(leaves(stepOf(store.getState().doc).expression)[4].node.id);
  });
  it('removes selected fractions structurally by Delete and reverses with Ctrl+Z', () => {
    const {container,store} = mount(); const first=leaves(stepOf(store.getState().doc).expression)[0].node;
    fireEvent.click(container.querySelector('[data-node-id="'+first.id+'"]')!);
    fireEvent.keyDown(container.querySelector('.scratchpad')!, { key:'Delete' });
    expect(latex(stepOf(store.getState().doc).expression)).not.toContain('\\frac{2}{3}');
    fireEvent.keyDown(container.querySelector('.scratchpad')!, { key:'z', ctrlKey:true });
    expect(latex(stepOf(store.getState().doc).expression)).toContain('\\frac{2}{3}');
    fireEvent.keyDown(container.querySelector('.scratchpad')!, { key:'Z', ctrlKey:true, shiftKey:true });
    expect(latex(stepOf(store.getState().doc).expression)).not.toContain('\\frac{2}{3}');
  });
  it('opens keyboard-operated insertion chooser, arrows move focus and Enter inserts a fraction', () => {
    const {container,store}=mount(); click('Step 1 Insert after item 1'); click('⊕ Insert…');
    const dialog=screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    fireEvent.keyDown(dialog,{key:'ArrowRight'});
    fireEvent.keyDown(dialog,{key:'ArrowLeft'});
    fireEvent.keyDown(dialog,{key:'Enter'});
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(latex(stepOf(store.getState().doc).expression)).toContain('\\frac{\\square}{\\square}');
    fireEvent.click(screen.getByRole('button',{name:'⊕ Insert…'}));
    fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('copies a review prompt only when the clipboard succeeds', async () => {
    const copy=vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}});
    const {container,store}=mount();
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
    mount(); click('Check · Copy for Review');
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
  it('starts 30 Persian-stem questions, preserves each answer with Next and Previous and has no hints',()=>{
    const {container,store}=mount();click('Exercise menu');click('Start 30-question diagnostic');click('Start 30 Questions');
    expect(store.getState().doc.exercises).toHaveLength(30);
    expect(store.getState().doc.exercises[0].prompt).toContain('هم‌ارز');
    expect(container.querySelector('.scratchpad')?.getAttribute('dir')).toBe('ltr');
    expect(screen.getByText(/برای هم‌ارز شدن/).getAttribute('dir')).toBe('rtl');
    expect(container.textContent?.toLowerCase()).not.toContain('hint');
    fireEvent.keyDown(container.querySelector('.scratchpad')!,{key:'9'});
    const first=latex(stepOf(store.getState().doc).expression);
    click('Next Problem →');
    expect(store.getState().doc.exercises[0].steps[0].expression).toBeTruthy();
    expect(latex(stepOf(store.getState().doc).expression)).toBe('\\square');
    click('← Previous');
    expect(latex(stepOf(store.getState().doc).expression)).toBe(first);
  });
  it('marks changed prior steps for review without mutating later expressions',()=>{
    const {container,store}=mount();click('+ New Step');
    fireEvent.keyDown(container.querySelector('.scratchpad')!,{key:'5'});
    const ex=exerciseOf(store.getState().doc), later=latex(ex.steps[1].expression);
    fireEvent.click(container.querySelector('[data-node-id="'+leaves(ex.steps[0].expression)[0].node.id+'"]')!);
    fireEvent.keyDown(container.querySelector('.scratchpad')!,{key:'9'});
    expect(container.querySelector('[data-step-id="'+ex.steps[0].id+'"] .step-state')?.textContent).toBe('Edited');
    expect(container.querySelector('[data-step-id="'+ex.steps[1].id+'"] .step-state')?.textContent).toBe('Needs review');
    expect(latex(exerciseOf(store.getState().doc).steps[1].expression)).toBe(later);
  });
});
