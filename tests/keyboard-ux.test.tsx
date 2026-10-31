import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Provider } from '../src/app/store-provider';
import { App } from '../src/App';
import { QuestionTimer } from '../src/QuestionTimer';
import { actions, activeInfo, exerciseOf, initialState, makeStore, stepOf } from '../src/store';
import { elapsedAt, latex, leaves, stepLatex } from '../src/model';
import { serialize, validateSession } from '../src/persistence';
import { fingerprint } from '../src/review';
import { parse } from '../src/parser';
import { menuAction } from './support/menu-actions';
const create=()=>makeStore(initialState());
function mount(){const store=create();render(<Provider store={store}><App/></Provider>);return store;}
function number(store:ReturnType<typeof create>, value='1234'){
 store.dispatch(actions.command({type:'clear'}));for(const v of value)store.dispatch(actions.command({type:'digit',value:v}));
}
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
describe('Predictable keyboard editing',()=>{
 it('walks every numeral before leaving a fraction numerator; virtual and physical arrows share the same reducer',()=>{
  const s=create();const st=stepOf(s.getState().doc),n=leaves(st.expression)[0].node;
  s.dispatch(actions.select({stepId:st.id,nodeId:n.id,offset:0}));
  s.dispatch(actions.command({type:'digit',value:'1'})); // 12
  s.dispatch(actions.select({stepId:st.id,nodeId:n.id,offset:0}));
  for(const offset of [1,2]){s.dispatch(actions.horizontal(1));expect(s.getState().doc.cursor.nodeId).toBe(n.id);expect(s.getState().doc.cursor.offset).toBe(offset);}
  s.dispatch(actions.horizontal(1));expect(activeInfo(s.getState().doc)?.node).toMatchObject({type:'operator',value:'+'});
  s.dispatch(actions.horizontal(-1));expect(s.getState().doc.cursor.offset).toBe(1); // previous leaf is denominator, edge entry
 });
 it('Delete removes the digit after the caret, Backspace the digit before; Undo restores both caret and value',()=>{
  const s=create();number(s);let st=stepOf(s.getState().doc);const n=leaves(st.expression)[0].node;
  s.dispatch(actions.select({stepId:st.id,nodeId:n.id,offset:2}));
  s.dispatch(actions.command({type:'deleteForward'}));expect(latex(stepOf(s.getState().doc).expression)).toBe('124');expect(s.getState().doc.cursor.offset).toBe(2);
  s.dispatch(actions.undo());expect(latex(stepOf(s.getState().doc).expression)).toBe('1234');expect(s.getState().doc.cursor.offset).toBe(2);
  s.dispatch(actions.command({type:'backspace'}));expect(latex(stepOf(s.getState().doc).expression)).toBe('134');expect(s.getState().doc.cursor.offset).toBe(1);
 });
 it('Delete Item targets the active number and leaves the rest of its fraction intact',()=>{
  const s=create();const st=stepOf(s.getState().doc),n=leaves(st.expression)[0].node;
  s.dispatch(actions.select({stepId:st.id,nodeId:n.id,offset:1}));s.dispatch(actions.command({type:'deleteStructure'}));
  expect(latex(stepOf(s.getState().doc).expression)).toBe('\\frac{\\square}{3}+\\frac{1}{4}');
  s.dispatch(actions.undo());expect(latex(stepOf(s.getState().doc).expression)).toBe('\\frac{2}{3}+\\frac{1}{4}');expect(s.getState().doc.cursor.nodeId).toBe(n.id);
 });
 it('after removing a middle item, typing stays at its old position instead of jumping to the first token',()=>{
  const s=create();const st=stepOf(s.getState().doc);
  s.dispatch(actions.select({stepId:st.id,nodeId:st.expression.children[1].id}));s.dispatch(actions.command({type:'deleteStructure'}));
  expect(s.getState().doc.cursor.index).toBe(1);s.dispatch(actions.command({type:'digit',value:'7'}));
  expect(latex(stepOf(s.getState().doc).expression)).toBe('\\frac{2}{3}7\\frac{1}{4}');
 });
 it('a blank numerator does not silently delete a populated denominator; selection-only Backspace creates no Undo entry',()=>{
  const s=create();const st=stepOf(s.getState().doc),n=leaves(st.expression)[0].node;
  s.dispatch(actions.select({stepId:st.id,nodeId:n.id,offset:1}));s.dispatch(actions.command({type:'backspace'}));
  const count=s.getState().past.length;s.dispatch(actions.command({type:'backspace'}));
  expect(latex(stepOf(s.getState().doc).expression)).toContain('\\frac{\\square}{3}');expect(s.getState().doc.cursor.selected).toBe(st.expression.children[0].id);expect(s.getState().past.length).toBe(count);
 });
 it('Undo stays inside the current question and does not rewind another answer, confidence or recorded time',()=>{
  const s=create();s.dispatch(actions.startFractionRound());number(s,'12');const first=exerciseOf(s.getState().doc).id;
  s.dispatch(actions.setConfidence('high'));s.dispatch(actions.addQuestionTime({exerciseId:first,milliseconds:5000}));
  s.dispatch(actions.adjacentExercise(1));number(s,'34');s.dispatch(actions.adjacentExercise(-1));s.dispatch(actions.undo());
  expect(s.getState().doc.exerciseId).toBe(first);expect(latex(exerciseOf(s.getState().doc).steps[0].expression)).toBe('1');
  expect(latex(s.getState().doc.exercises[1].steps[0].expression)).toBe('34');expect(exerciseOf(s.getState().doc).confidence).toBe('high');expect(exerciseOf(s.getState().doc).elapsedMs).toBe(5000);
 });
 it('slash opens the chooser, Cancel remains reachable with Tab, Escape closes, and typing in text fields is not intercepted',()=>{
  mount();const main=document.querySelector('main')!;fireEvent.keyDown(main,{key:'/'});expect(screen.getByRole('dialog')).toBeTruthy();
  const cancel=screen.getByRole('button',{name:'Cancel · Esc'});cancel.focus();fireEvent.keyDown(cancel,{key:'Tab'});expect(document.activeElement).toBe(screen.getByRole('button',{name:'Fraction'}));
  fireEvent.keyDown(document.activeElement!,{key:'Escape'});expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(menuAction('Show more'));fireEvent.click(menuAction('Keyboard shortcuts'));
  expect(screen.getByText('Open Insert Math Element; choose Fraction to insert a fraction')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Close'}));
  fireEvent.click(menuAction('Import session JSON'));fireEvent.keyDown(screen.getByLabelText('Copy or paste session JSON'),{key:'/'});expect(screen.queryByRole('dialog')).toBeNull();
 });
 it('arrows on regular buttons never move the math cursor, and composition input does not insert partial text',()=>{
  const s=mount(),before=JSON.stringify(s.getState().doc.cursor);
  fireEvent.keyDown(screen.getByRole('button',{name:'Exercise menu'}),{key:'ArrowRight'});expect(JSON.stringify(s.getState().doc.cursor)).toBe(before);
  const expression=latex(stepOf(s.getState().doc).expression);fireEvent.keyDown(document.querySelector('main')!,{key:'5',isComposing:true});expect(latex(stepOf(s.getState().doc).expression)).toBe(expression);
 });
 it('keeps focus in the single MathLive field and inserts a minus at its exact caret position',()=>{
  const s=mount(), field=screen.getByLabelText('Step 1 expression') as HTMLElement & { value: string; position: number };
  field.value='12345';fireEvent.input(field);field.position=2;field.focus();fireEvent.keyDown(field,{key:'-'});
  expect(document.activeElement).toBe(field);
  expect(stepLatex(stepOf(s.getState().doc))).toBe('12-345');
  expect(field.position).toBe(3);
 });
 it('Next field moves to the next inserted MathLive placeholder before physical typing',async()=>{
  const s=mount();const field=screen.getByLabelText('Step 1 expression') as HTMLElement & { value:string };
  await userEvent.click(screen.getByRole('button',{name:'Show Keyboard'}));
  await userEvent.click(screen.getByRole('button',{name:/^Fraction$/}));
  await userEvent.click(screen.getByRole('button',{name:'More tools'}));
  await userEvent.click(screen.getByRole('button',{name:'Next field'}));
  fireEvent.keyDown(field,{key:'7'});
  expect(field.value).toContain('7');
  expect(stepLatex(stepOf(s.getState().doc))).toBe(field.value);
 });
 it('inserting parentheses after an operator keeps later terms outside the group',()=>{
  const s=create(),step=stepOf(s.getState().doc);step.expression=parse('1+45+6');
  const operator=step.expression.children[1];
  s.dispatch(actions.select({stepId:step.id,nodeId:operator.id}));
  s.dispatch(actions.command({type:'operator',value:'−'}));
  s.dispatch(actions.command({type:'insert',value:'group'}));
  s.dispatch(actions.command({type:'digit',value:'3'}));
  expect(latex(stepOf(s.getState().doc).expression)).toBe('1-\\left(3\\right)45+6');
 });
 it('wrapping the current term in parentheses does not absorb neighboring expression terms',()=>{
  const s=create(),step=stepOf(s.getState().doc);step.expression=parse('3+45+6');
  const firstTerm=step.expression.children[0];
  s.dispatch(actions.select({stepId:step.id,nodeId:firstTerm.id}));
  s.dispatch(actions.command({type:'insert',value:'group'}));
  expect(latex(stepOf(s.getState().doc).expression)).toBe('\\left(3\\right)+45+6');
 });
 it('single-question review requests confidence in a modal and persists the explicit choice',async()=>{
  const s=mount(); expect(screen.queryAllByRole('radio')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button',{name:'Check · Copy for Review'}));
  expect(screen.getByRole('dialog',{name:/confidence/i})).toBeTruthy();
  expect(screen.getAllByRole('radio').some(r=>(r as HTMLInputElement).checked)).toBe(false);
  fireEvent.click(screen.getByRole('radio',{name:'Medium'}));
  fireEvent.click(screen.getByRole('button',{name:/continue/i}));
  await waitFor(()=>expect(validateSession(JSON.parse(serialize(s.getState()))).doc.exercises[0].confidence).toBe('medium'));
 });
 it('timer metadata roundtrips and ticking does not mark a previously copied answer as changed',()=>{
  const s=create(),before=fingerprint(s.getState().doc);s.dispatch(actions.addQuestionTime({exerciseId:s.getState().doc.exerciseId,milliseconds:12345}));
  expect(fingerprint(s.getState().doc)).toBe(before);expect(validateSession(JSON.parse(serialize(s.getState()))).doc.exercises[0].elapsedMs).toBe(12345);
 });
});
describe('Question time accounting (wall clock)',()=>{
 it('counts hidden/blurred time, stops only on manual Pause, and never attributes another question\'s time',()=>{
  vi.useFakeTimers();const T=Date.UTC(2026,0,1);vi.setSystemTime(T);
  const s=create(),id=s.getState().doc.exerciseId,at=()=>elapsedAt(exerciseOf(s.getState().doc));
  const view=render(<Provider store={s}><QuestionTimer exerciseId={id}/></Provider>);
  act(()=>vi.advanceTimersByTime(1250));expect(at()).toBe(1250);
  fireEvent.click(screen.getByRole('button',{name:'Pause'}));act(()=>vi.advanceTimersByTime(3000));expect(at()).toBe(1250);
  fireEvent.click(screen.getByRole('button',{name:'Resume'}));fireEvent(window,new Event('blur'));act(()=>vi.advanceTimersByTime(500));expect(at()).toBe(1750);
  view.unmount();act(()=>vi.advanceTimersByTime(250));expect(at()).toBe(2000);
  vi.useRealTimers();
 });
});
