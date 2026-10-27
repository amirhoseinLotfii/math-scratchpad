import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Provider } from '../../src/app/store-provider';
import { App } from '../../src/App';
import { actions, exerciseOf, initialState, makeStore } from '../../src/store';
import { latex } from '../../src/model';
function viewport(initial: number) {
 let width = initial; const listeners = new Set<() => void>();
 vi.stubGlobal('matchMedia', (query: string) => ({ media: query, get matches() { return width >= Number(query.match(/min-width:\s*(\d+)/)?.[1] ?? Infinity); }, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) }));
 return (next: number) => act(() => { width = next; listeners.forEach(fn => fn()); });
}
function mount(width = 1920, batch = true) {
 const resize = viewport(width), store = makeStore(initialState());
 if (batch) store.dispatch(actions.startFractionRound());
 const view = render(<div id="math-scratchpad-redux"><Provider store={store}><App /></Provider></div>);
 return { store, resize, user: userEvent.setup(), ...view };
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('wide workspace: layout and single source of state', () => {
 it.each([[899,'phone'],[900,'laptop'],[1440,'laptop'],[1599,'laptop'],[1600,'desktop'],[2560,'desktop']])('uses the %s viewport layout %s', (width, layout) => {
  mount(Number(width)); expect(screen.getByRole('main')).toHaveAttribute('data-layout', String(layout));
 });
 it('laptop keeps the dropdown and one question context without a permanent navigator', () => {
  mount(1440); expect(screen.getByRole('combobox', { name:'Current exercise' })).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name:'Questions' })).toBeNull();
  expect(screen.getAllByRole('region', { name:'Question context' })).toHaveLength(1);
  expect(screen.getByRole('region', { name:'Your work' })).toBeInTheDocument();
 });
 it('desktop exposes all question destinations and exactly one active question', () => {
  mount(); const nav = screen.getByRole('navigation', {name:'Questions'});
  expect(within(nav).getAllByRole('button')).toHaveLength(20);
  expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
 });
 it('single-question desktop omits batch navigator and preserves review action', () => {
  mount(1920,false); expect(screen.queryByRole('navigation',{name:'Questions'})).toBeNull();
  expect(screen.getByRole('button',{name:'Check · Copy for Review'})).toBeInTheDocument();
 });
 it('resizing across all layouts preserves work, history, confidence and cursor', () => {
  const {store,resize}=mount(); act(()=>{store.dispatch(actions.command({type:'digit',value:'123'}));store.dispatch(actions.setConfidence('medium'));});
  const before=structuredClone(store.getState()); resize(1440); resize(390); resize(1920);
  expect(store.getState().doc).toEqual(before.doc);expect(store.getState().past).toEqual(before.past);
 });
 it('wide defaults do not show a numeric keypad', () => {mount();expect(screen.queryByRole('group',{name:'Numeric keys'})).toBeNull();});
 it('virtual keyboard remains an explicit preference across resizing',async()=>{
  const {user,resize}=mount();await user.click(screen.getByRole('button',{name:/Show Keyboard/}));
  resize(1440);expect(screen.getByRole('group',{name:'Numeric keys'})).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:/Hide Keyboard/})); resize(1920);
  expect(screen.queryByRole('group',{name:'Numeric keys'})).toBeNull();
 });
});
describe('wide question navigator',()=>{
 it('switches to a named question while retaining the current draft without inventing confidence',async()=>{
  const {store,user}=mount();fireEvent.keyDown(screen.getByRole('main'),{key:'7'});const first=store.getState().doc.exerciseId;
  await user.click(screen.getByRole('button',{name:'Question 2 Not started'}));
  expect(store.getState().doc.exerciseId).not.toBe(first);expect(store.getState().doc.exercises[0].confidence).toBeUndefined();
  await user.click(screen.getByRole('button',{name:'Question 1 Draft'}));
  expect(latex(exerciseOf(store.getState().doc).steps[0].expression)).toBe('7');
 });
 it('focusing a destination does not switch question',()=>{const {store}=mount();const before=store.getState().doc.exerciseId;screen.getByRole('button',{name:'Question 2 Not started'}).focus();expect(store.getState().doc.exerciseId).toBe(before);});
 it('ArrowDown, Home and End move focus without activating question buttons',()=>{
  const {store}=mount();const nav=screen.getByRole('navigation',{name:'Questions'}), buttons=within(nav).getAllByRole('button'),before=store.getState().doc.exerciseId;
  buttons[0].focus();fireEvent.keyDown(buttons[0],{key:'ArrowDown'});expect(buttons[1]).toHaveFocus();
  fireEvent.keyDown(buttons[1],{key:'End'});expect(buttons.at(-1)).toHaveFocus();
  fireEvent.keyDown(buttons.at(-1)!,{key:'Home'});expect(buttons[0]).toHaveFocus();expect(store.getState().doc.exerciseId).toBe(before);
 });
 it('reports skipped questions without implying an answer was checked',()=>{
  const {store}=mount();act(()=>store.dispatch(actions.setSkipped(true)));
  expect(screen.getByRole('button',{name:'Question 1 Skipped'})).toBeInTheDocument();
  expect(screen.queryByText(/correct answer/i)).toBeNull();
 });
});
describe('wide toolbar and step behavior',()=>{
 it('offers one quick toolbar in the approved order with undo and redo disabled initially',()=>{
  mount();const tools=screen.getByRole('group',{name:'Quick math tools'});
  expect(within(tools).getAllByRole('button').map(b=>b.getAttribute('aria-label'))).toEqual(['Insert fraction','Insert parentheses','Insert square root','Insert power','Insert equals']);
  expect(screen.getByRole('button',{name:'Undo'})).toBeDisabled();expect(screen.getByRole('button',{name:'Redo'})).toBeDisabled();
 });
 it('undo and redo target the current question and return typing to the editor',async()=>{
  const {store,user}=mount();fireEvent.keyDown(screen.getByRole('main'),{key:'5'});
  await user.click(screen.getByRole('button',{name:'Undo'}));expect(latex(exerciseOf(store.getState().doc).steps[0].expression)).toBe('\\square');expect(screen.getByRole('main')).toHaveFocus();
  await user.click(screen.getByRole('button',{name:'Redo'}));expect(latex(exerciseOf(store.getState().doc).steps[0].expression)).toBe('5');
 });
 it('Add step stays blank and first step remains protected',async()=>{
  const {store,user}=mount();await user.click(screen.getByRole('button',{name:'Add step'}));
  expect(latex(exerciseOf(store.getState().doc).steps[1].expression)).toBe('\\square');
  expect(screen.getByRole('button',{name:'Delete Step 1'})).toBeDisabled();expect(screen.getByRole('button',{name:'Delete Step 2'})).toBeEnabled();
 });
 it('More math tools opens the same insertion dialog without opening a numeric keypad',async()=>{
  const {user}=mount();await user.click(screen.getByRole('button',{name:'More math tools'}));
  expect(screen.getByRole('dialog',{name:'Insert Math Element'})).toBeInTheDocument();expect(screen.queryByRole('group',{name:'Numeric keys'})).toBeNull();
 });
 it.each([['Integral','\\int'],['2 by 2 matrix','\\begin{bmatrix}'],['Variable x','x'],['Infinity','\\infty'],['≤','\\le'],['Factorial','!']])('inserts advanced %s directly without a virtual keypad',async(name,expected)=>{
  const {store,user}=mount();await user.click(screen.getByRole('button',{name:'More math tools'}));
  await user.click(within(screen.getByRole('dialog',{name:'Insert Math Element'})).getByRole('button',{name:'مشاهده بیشتر'}));
  await user.click(within(screen.getByRole('dialog',{name:'Insert Math Element'})).getByRole('button',{name}));
  expect(latex(exerciseOf(store.getState().doc).steps[0].expression)).toContain(expected);
  expect(screen.queryByRole('group',{name:'Numeric keys'})).toBeNull();expect(screen.getByRole('main')).toHaveFocus();
 });
 it('pressing Enter on an unrelated toolbar control does not type into a number',()=>{
  const {store}=mount();const before=structuredClone(store.getState().doc);
  fireEvent.keyDown(screen.getByRole('button',{name:'Insert equals'}),{key:'7'});expect(store.getState().doc).toEqual(before);
 });
});
describe('wide accessibility and decisions',()=>{
 it('opens named shortcut help and restores invoking focus on Escape',async()=>{
  const {user}=mount();const trigger=screen.getByRole('button',{name:'Keyboard shortcuts'});await user.click(trigger);
  const dialog=screen.getByRole('dialog',{name:'Keyboard shortcuts'});expect(dialog).toHaveAccessibleDescription();
  expect(within(dialog).getByText('Move focus')).toBeInTheDocument();await user.keyboard('{Escape}');expect(trigger).toHaveFocus();
 });
 it('Next still requires explicit confidence and Cancel preserves draft and question',async()=>{
  const {store,user}=mount();await user.click(screen.getByRole('button',{name:'Pause'}));fireEvent.keyDown(screen.getByRole('main'),{key:'8'});const before=structuredClone(store.getState().doc);
  expect(screen.queryByRole('radio')).toBeNull();await user.click(screen.getByRole('button',{name:/Next question/}));
  await user.click(screen.getByRole('button',{name:'Cancel'}));expect(store.getState().doc).toEqual(before);
 });
 it('contains no duplicate IDs, positive tabindex or nested actionable controls',()=>{
  const {container}=mount();const ids=[...container.querySelectorAll('[id]')].map(e=>e.id);expect(new Set(ids).size).toBe(ids.length);
  expect(container.querySelector('button button, button input, button a')).toBeNull();expect([...container.querySelectorAll('[tabindex]')].some(e=>Number(e.getAttribute('tabindex'))>0)).toBe(false);
 });
});
