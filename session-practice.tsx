import './src/fonts.css';
import './src/styles/tokens.css';
import './src/styles/globals.css';
import './src/styles.css';
import { createRoot } from 'react-dom/client';
import { Provider } from './src/app/store-provider';
import { App } from './src/App';
import { makeStore, actions, initialState } from './src/store';
import { serialize, validateSession } from './src/persistence';
import { fractionRoundOne } from './src/fractionRoundOne';
const bankId = 'S001-C01-PRACTICE20-r1-20261027';
const f = (a:number,b:number) => `\\frac{${a}}{${b}}`;
const rows: [string,string,string][] = [
 ['تفریق و علامت',`${f(1,5)}-${f(3,5)}`,'-2/5'],
 ['تفریق و علامت',`${f(1,6)}-${f(3,4)}`,'-7/12'],
 ['تفریق و علامت',`${f(2,5)}-${f(7,10)}`,'-3/10'],
 ['تفریق و علامت',`${f(3,8)}-${f(5,4)}`,'-7/8'],
 ['جمع کسرها',`${f(2,3)}+${f(1,4)}`,'11/12'],
 ['جمع کسرها',`${f(3,5)}+${f(1,6)}`,'23/30'],
 ['جمع کسرها',`${f(5,12)}+${f(2,9)}`,'23/36'],
 ['جمع کسرها',`-${f(2,3)}+${f(1,4)}`,'-5/12'],
 ['عدد مخلوط',`2${f(3,5)}`,'13/5'],
 ['عدد مخلوط',`4${f(2,3)}`,'14/3'],
 ['عدد مخلوط',`3${f(1,4)}-1${f(2,3)}`,'19/12'],
 ['عدد مخلوط',`2${f(2,5)}+1${f(3,4)}`,'83/20'],
 ['ترتیب عملیات',`${f(1,2)}+${f(2,3)}\\times${f(3,4)}`,'1'],
 ['ترتیب عملیات',`(${f(1,2)}+${f(2,3)})\\times${f(3,4)}`,'7/8'],
 ['ترتیب عملیات',`${f(3,4)}-${f(1,2)}\\times${f(2,3)}`,'5/12'],
 ['ترتیب عملیات',`(${f(3,4)}-${f(1,2)})\\times${f(2,3)}`,'1/6'],
 ['ضرب کسرها',`${f(3,5)}\\times${f(10,9)}`,'2/3'],
 ['ضرب کسرها',`1${f(1,2)}\\times${f(4,5)}`,'6/5'],
 ['تقسیم کسرها',`${f(3,4)}\\div${f(2,5)}`,'15/8'],
 ['تقسیم کسرها',`1${f(1,2)}\\div${f(3,4)}`,'2'],
];
fractionRoundOne.splice(0, fractionRoundOne.length, ...rows.map(([skill,source,expected],i)=>({
 id:i+1,skill,source,expected,simplest:true,verification:'exact rational verification',rubric:'Numerical value, simplified fraction, valid equalities; reasoning reviewed separately.',
 stem:`S001 · ${bankId} · Q${String(i+1).padStart(2,'0')} — ${i===8||i===9?'عدد مخلوط را به کسر تبدیل کن':'حاصل عبارت را محاسبه کن'}. مراحل را ثبت کن و پاسخ نهایی را به صورت کسر ساده با مخرج مثبت بنویس.`,
})));
let state=initialState();
const key=`math-scratchpad-${bankId}`;
try { const raw=localStorage.getItem(key); if(raw){const saved=validateSession(JSON.parse(raw));if(saved.doc.exercises.length===20 && saved.doc.exercises.every((e,i)=>e.source===rows[i][1]&&e.prompt?.includes(bankId)))state={...state,...saved};} } catch {}
const store=makeStore(state);
if(!state.doc.exercises[0]?.prompt?.includes(bankId)) store.dispatch(actions.startFractionRound());
store.dispatch(actions.keyboard(true));
store.dispatch(actions.notice(`${bankId} | Check copies only. Export Session JSON when submitting.`));
let pending: ReturnType<typeof setTimeout>;
store.subscribe(()=>{clearTimeout(pending);pending=setTimeout(()=>{try{localStorage.setItem(key,serialize(store.getState()));}catch{}},180);});
createRoot(document.getElementById('math-scratchpad-redux')!).render(<Provider store={store}><App/></Provider>);
