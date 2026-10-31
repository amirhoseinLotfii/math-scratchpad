import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from '../src/app/store-provider';
import { App } from '../src/App';
import { actions, initialState, makeStore, exerciseOf, stepOf } from '../src/store';
import { fractionRoundOne, fractionCompetencies } from '../src/fractionRoundOne';
import { evaluateSequence, gradeDiagnostic } from '../src/assessment';
import { parse } from '../src/parser';
import { latex, leaves } from '../src/model';
import { serialize, validateSession } from '../src/persistence';
import { menuAction } from './support/menu-actions';
afterEach(cleanup);
function mount(round = false) {
 const store=makeStore(initialState());if(round)store.dispatch(actions.startFractionRound());
 const view=render(<div id="math-scratchpad-redux"><Provider store={store}><App/></Provider></div>);
 return {store,...view};
}
const click=(name:string)=>name==='⊕ Insert…'?fireEvent.keyDown(screen.getByRole('main'),{key:'/'}):fireEvent.click(screen.queryByRole('button',{name:name.startsWith('⌨ Show')?'Show Keyboard':name.startsWith('⌨ Hide')?'Hide Keyboard':name})??menuAction(name));
describe('Minimal original-UI fixes and twenty-question round',()=>{
 it('closes Insert on backdrop or Escape, preserves inside clicks and leaves work intact',async()=>{
  const {store}=mount();const before=JSON.stringify(exerciseOf(store.getState().doc).steps);
  screen.getByRole('main').focus();await userEvent.keyboard('/');
  await userEvent.click(screen.getByRole('heading',{name:'Insert Math Element'}));expect(screen.getByRole('dialog')).toBeTruthy();
  await userEvent.click(document.querySelector('.modal-overlay')!);expect(screen.queryByRole('dialog')).toBeNull();
  expect(JSON.stringify(exerciseOf(store.getState().doc).steps)).toBe(before);
  screen.getByRole('main').focus();await userEvent.keyboard('/[Escape]');expect(screen.queryByRole('dialog')).toBeNull();
 });
 it('removes an empty inserted structure with the keyboard Backspace without leaving visible insertion dots; Undo restores it',()=>{
  const {store,container}=mount();click('⌨ Show Keyboard');click('Add step');click('Insert fraction');
  const deleted=stepOf(store.getState().doc).expression.children[0].id;
  click('Backspace');
  expect(stepOf(store.getState().doc).expression.children.some(n=>n.id===deleted)).toBe(false);
  const current=screen.getByLabelText('Step 2 expression');
  expect(current.querySelector('.fraction')).toBeNull();
  expect([...current.querySelectorAll('.math-gap')].every(el=>el.textContent==='')).toBe(true);
  act(()=>store.dispatch(actions.undo()));expect(screen.getByLabelText('Step 2 expression').querySelector('.fraction')).toBeTruthy();
  expect(container.querySelectorAll('.math-gap').length).toBeGreaterThan(0);
 });
 it('preserves literal decimal points while hiding decorative insertion dots',()=>{
  const {store}=mount();click('Add step');
  act(()=>{for(const value of ['1','.','5'])store.dispatch(actions.command({type:'digit',value}));});
  expect(screen.getByLabelText('Step 2 number 1.5')).toBeTruthy();
 });
 it('adds twenty questions in the original notebook and retains answers, confidence and skips through JSON',async()=>{
  const {store}=mount();click('Exercise menu');click('Start Round 1 · 20 fraction questions');click('Start 20 Questions');
  expect(store.getState().doc.exercises).toHaveLength(20);
  expect((screen.getByLabelText('Select question') as HTMLSelectElement).selectedOptions[0]?.textContent).toBe('Question 1 · Not started');
  expect(document.querySelectorAll('.header-progress-track')).toHaveLength(1);
  expect(document.querySelector('.header-progress-copy')?.textContent).toBe('0 of 20 practice questions answered');
  expect(screen.queryByText('Question 1 of 20')).toBeNull();
  expect(document.querySelector('.question-navigator .header-progress')).toBeNull();
  expect(screen.getByLabelText('Current problem').textContent).toContain(fractionRoundOne[0].stem);
  expect(screen.queryByLabelText('Diagnostic report')).toBeNull();
  act(()=>{store.dispatch(actions.command({type:'digit',value:'7'}));store.dispatch(actions.setConfidence('high'));});
  await userEvent.click(screen.getByRole('button',{name:/Next question/}));await userEvent.click(screen.getByRole('button',{name:/Continue/}));act(()=>store.dispatch(actions.setSkipped(true)));click('← Previous');
  expect(latex(exerciseOf(store.getState().doc).steps[0].expression)).toBe('7');
  expect(exerciseOf(store.getState().doc).confidence).toBe('high');
  const exported=serialize(store.getState()),restored=validateSession(JSON.parse(exported));
  expect(exported).not.toContain('expected');expect(restored.doc.exercises[0].assessment).toBe('fractions-round-1');expect(restored.doc.exercises[1].skipped).toBe(true);
  expect(document.querySelector('.header-progress-copy')?.textContent).toBe('1 of 20 practice questions answered · 1 skipped');
 });
 it('uses the correct answer bank for the new round while retaining the original thirty-question mode',()=>{
  const {store}=mount(true);const ex=exerciseOf(store.getState().doc);
  const doc=JSON.parse(JSON.stringify(store.getState().doc));doc.exercises[0].steps[0].expression=parse('\\frac{1}{8}');doc.exercises[0].steps[0].final=true;
  doc.cursor.nodeId=leaves(doc.exercises[0].steps[0].expression)[0].node.id;
  doc.exercises.forEach((e: any,i: number)=>{if(i===0)e.confidence='high';else e.skipped=true;});
  act(()=>{store.dispatch(actions.load({doc}));store.dispatch(actions.switchExercise(doc.exercises.at(-1).id));});click('Finish session');click('Finish & Analyze');
  expect(screen.getByLabelText('Diagnostic report').textContent).toContain('1/20');
  expect(gradeDiagnostic(ex,fractionRoundOne[0]).numeric).toBe('unverified');
  act(()=>store.dispatch(actions.startDiagnostic()));expect(store.getState().doc.exercises).toHaveLength(30);expect(store.getState().doc.exercises[0].assessment).toBeUndefined();
 });
 it('verifies twenty answer keys, all mathematical display expressions and two questions per competency',()=>{
  expect(fractionRoundOne).toHaveLength(20);
  for(const skill of fractionCompetencies)expect(fractionRoundOne.filter(q=>q.skill===skill)).toHaveLength(2);
  for(const q of fractionRoundOne){expect(evaluateSequence(parse(q.verification)),`Q${q.id}`).toEqual(evaluateSequence(parse(q.expected)));if(q.source)expect(()=>parse(q.source)).not.toThrow();}
 });
});
