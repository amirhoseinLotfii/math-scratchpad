import '@testing-library/jest-dom/vitest';
import { act,cleanup,render,screen,waitFor,within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,describe,it,expect,vi} from 'vitest';
import { App } from '../../src/App';
import {Provider} from '../../src/app/store-provider';
import {makeStore,initialState,actions} from '../../src/store';
import {BANK_SCHEMA,bankDocument,validateBank} from '../../src/features/drive-bank/drive-bank';
import {serialize,validateSession} from '../../src/persistence';
import {exportItem,missingFinalAnswers} from '../../src/features/session/export/tutor-export';
import {reviewPayload} from '../../src/review';
import {latex} from '../../src/model';
const bank={schema_version:BANK_SCHEMA,bank_id:'ui-test',version:'v1',questions:[
 {id:'M',mode:'math',source:'1/2+3^2'},
 {id:'PA-1.1-02',mode:'text',prompt:'Prealgebra 1.1 · Numbers:\nاین عدد را به انگلیسی با کلمه بنویس.',source:'4,035'},
 {id:'PA-1.1-03',mode:'text',source:'two million, sixty thousand, nine'},
 {id:'PA-1.1-06',mode:'text',source:'8,099 ___ 8,909',answerType:'choice',choices:['<','>']}
]};
function mount(){const store=makeStore(initialState());store.dispatch(actions.load({doc:bankDocument(validateBank(bank),'v1')}));render(<div id="math-scratchpad-redux"><Provider store={store}><App/></Provider></div>);return {store,user:userEvent.setup()};}
const switchTo=(store:ReturnType<typeof makeStore>,index:number)=>act(()=>{store.dispatch(actions.switchExercise(store.getState().doc.exercises[index].id));});
afterEach(()=>{cleanup();localStorage.clear();vi.unstubAllGlobals();});
describe('answer types and keyboard integration',()=>{
 it('shows the prompt and text source and accepts mixed scripts without a click',async()=>{
  const {store,user}=mount();switchTo(store,1);const answer=screen.getByRole('textbox',{name:'Answer'});await waitFor(()=>expect(answer).toHaveFocus());
  expect(screen.getByText('4,035')).toBeInTheDocument();expect(screen.getByText('Prealgebra 1.1 · Numbers')).toHaveAttribute('dir','ltr');
  expect(screen.queryByRole('toolbar')).toBeNull();expect(screen.queryByText(/Write each step/)).toBeNull();
  await user.type(answer,'four thousand, thirty five فارسی');expect(store.getState().doc.exercises[1].answerText).toBe('four thousand, thirty five فارسی');
  expect(exportItem(store.getState().doc.exercises[1],1)).toMatchObject({answerText:'four thousand, thirty five فارسی',final_answer:'four thousand, thirty five فارسی'});
  expect(reviewPayload(store.getState().doc)).toMatchObject({answerText:'four thousand, thirty five فارسی'});expect(missingFinalAnswers(store.getState().doc)).toEqual([]);
 });
 it('restores text, choices and all math structure through version 2 backups',async()=>{
  const {store,user}=mount();const original=store.getState().doc.exercises[0].steps;switchTo(store,1);await user.type(screen.getByRole('textbox',{name:'Answer'}),'4,035');switchTo(store,3);await user.click(screen.getByRole('radio',{name:'<'}));
  const saved=JSON.parse(serialize(store.getState()));expect(saved.version).toBe(2);const restored=validateSession(saved);expect(restored.doc.exercises[0].steps).toEqual(original);expect(restored.doc.exercises[1].answerText).toBe('4,035');expect(restored.doc.exercises[3]).toMatchObject({answerType:'choice',answerText:'<',choices:['<','>']});
 });
 it('focuses first choice, selects by arrows and Space, and exposes the selection',async()=>{
  const {store,user}=mount();switchTo(store,3);const less=screen.getByRole('radio',{name:'<'}),greater=screen.getByRole('radio',{name:'>'});await waitFor(()=>expect(less).toHaveFocus());await user.keyboard('[ArrowRight]');expect(greater).toHaveFocus();expect(greater).toHaveAttribute('aria-checked','true');await user.keyboard('[ArrowLeft] ');expect(less).toHaveAttribute('aria-checked','true');expect(store.getState().doc.exercises[3].answerText).toBe('<');
 });
 it('supports direct fraction and power shortcuts and preserves math undo',async()=>{
  const {store,user}=mount();await waitFor(()=>expect(screen.getByRole('main')).toHaveFocus());await user.keyboard('/');expect(latex(store.getState().doc.exercises[0].steps[0].expression)).toContain('\\frac');await user.keyboard('2^3');expect(latex(store.getState().doc.exercises[0].steps[0].expression)).toContain('^{3}');await user.keyboard('{Control>}z{/Control}');expect(latex(store.getState().doc.exercises[0].steps[0].expression)).not.toContain('^{3}');
 });
 it.each(['Control','Meta'])('moves questions with %s+Alt shortcuts and focuses new text controls',async(modifier)=>{
  const {user}=mount();await waitFor(()=>expect(screen.getByRole('main')).toHaveFocus());await user.keyboard(`{${modifier}>}{Alt>}[ArrowRight]{/Alt}{/${modifier}}`);const confidence=screen.getByRole('dialog',{name:'Answer confidence'});await user.click(within(confidence).getByRole('radio',{name:'Medium'}));await user.click(within(confidence).getByRole('button',{name:'Continue'}));await waitFor(()=>expect(screen.getByRole('textbox',{name:'Answer'})).toHaveFocus());await user.keyboard(`{${modifier}>}{Alt>}[ArrowLeft]{/Alt}{/${modifier}}`);await waitFor(()=>expect(screen.getByRole('main')).toHaveFocus());
 });
 it('keeps the five primary actions and defaults Show more to collapsed',async()=>{
  const {user}=mount();await user.click(screen.getByRole('button',{name:'Exercise menu'}));expect(screen.getAllByRole('menuitem').map(x=>x.textContent)).toEqual(['Check · Copy for Review','Export for tutor (JSON)','Google Drive · بانک سؤال','New Problem','Skip question','Show more ⌄']);expect(screen.queryByRole('menuitem',{name:'Reset all local storage'})).toBeNull();await user.click(screen.getByRole('menuitem',{name:/Show more/}));expect(screen.getByRole('group',{name:'Help'})).toBeInTheDocument();expect(screen.getByRole('group',{name:'Danger zone'})).toBeInTheDocument();await user.keyboard('[Escape]');await waitFor(()=>expect(screen.getByRole('button',{name:'Exercise menu'})).toHaveFocus());
 });
 it('finds advanced tools without typing into math, and keeps a close action reachable',async()=>{vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));const {user,store}=mount();await user.click(screen.getByRole('button',{name:'More math tools'}));const dialog=screen.getByRole('dialog',{name:'Insert Math Element'});await user.click(within(dialog).getByRole('button',{name:/Show more/}));const before=JSON.stringify(store.getState().doc);await user.type(within(dialog).getByRole('textbox',{name:'Find a math tool'}),'Integral');expect(within(dialog).getByRole('button',{name:'Integral'})).toBeInTheDocument();expect(within(dialog).queryByRole('button',{name:'Fraction'})).toBeNull();expect(JSON.stringify(store.getState().doc)).toBe(before);await user.click(within(dialog).getByRole('button',{name:'Close tools · Esc'}));await waitFor(()=>expect(screen.getByRole('main')).toHaveFocus());});
 it('uses roving focus in the toolbar without consuming digits or creating steps',async()=>{
  const {user,store}=mount();await waitFor(()=>expect(screen.getByRole('main')).toHaveFocus());const toolbar=screen.getByRole('toolbar',{name:'Math tools'});expect(within(toolbar).getAllByRole('button').filter(x=>x.tabIndex===0)).toHaveLength(1);within(toolbar).getByRole('button',{name:'Insert fraction'}).focus();await user.keyboard('[ArrowRight]');expect(within(toolbar).getByRole('button',{name:'Insert number'})).toHaveFocus();const before=JSON.stringify(store.getState().doc);await user.keyboard('7');expect(JSON.stringify(store.getState().doc)).toBe(before);
 });
});
