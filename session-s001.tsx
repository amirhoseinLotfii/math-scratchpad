import { createRoot } from 'react-dom/client';
import { Provider } from './src/app/store-provider';
import { App } from './src/App';
import { makeStore, actions, initialState } from './src/store';
import { serialize, validateSession } from './src/persistence';
import { fractionRoundOne } from './src/fractionRoundOne';
const bankId = 'S001-C01-DIAG20-r1-20261026';
const f = (a:number,b:number) => `\\frac{${a}}{${b}}`;
const rows: [string,string,string][] = [
 ['علامت',`(-${f(4,7)})\\times${f(3,8)}`,'-3/14'],
 ['علامت',`(-${f(4,7)})\\times(-${f(3,8)})`,'3/14'],
 ['علامت',`-${f(5,12)}-${f(1,8)}`,'-13/24'],
 ['علامت',`-${f(5,12)}-(-${f(1,8)})`,'-7/24'],
 ['ترتیب عملیات',`${f(2,5)}+${f(3,4)}\\times${f(2,3)}`,'9/10'],
 ['ترتیب عملیات',`(${f(2,5)}+${f(3,4)})\\times${f(2,3)}`,'23/30'],
 ['ترتیب عملیات',`${f(7,8)}\\div${f(3,4)}\\times${f(2,5)}`,'7/15'],
 ['ترتیب عملیات',`${f(7,8)}\\div(${f(3,4)}\\times${f(2,5)})`,'35/12'],
 ['هم‌ارزی و ساده‌سازی',f(21,35),'3/5'],
 ['هم‌ارزی و ساده‌سازی',f(-32,48),'-2/3'],
 ['هم‌ارزی و ساده‌سازی',f(27,-45),'-3/5'],
 ['هم‌ارزی و ساده‌سازی',f(-27,-45),'3/5'],
 ['جمع و تفریق',`${f(3,8)}+${f(5,12)}`,'19/24'],
 ['جمع و تفریق',`${f(7,9)}-${f(5,6)}`,'-1/18'],
 ['جمع و تفریق',`1${f(2,5)}+2${f(3,8)}`,'151/40'],
 ['جمع و تفریق',`3${f(1,6)}-1${f(4,5)}`,'41/30'],
 ['ضرب و تقسیم',`${f(5,9)}\\times${f(3,10)}`,'1/6'],
 ['ضرب و تقسیم',`${f(5,9)}\\div${f(3,10)}`,'50/27'],
 ['ضرب و تقسیم',`1${f(3,5)}\\times2${f(1,4)}`,'18/5'],
 ['ضرب و تقسیم',`1${f(3,5)}\\div2${f(1,4)}`,'32/45'],
];
fractionRoundOne.splice(0, fractionRoundOne.length, ...rows.map(([skill,source,expected],i)=>({
 id:i+1,skill,source,expected,simplest:true,verification:'exact rational verification',rubric:'Numerical value, simplified fraction, valid equalities; reasoning reviewed separately.',
 stem:`S001 · ${bankId} · Q${String(i+1).padStart(2,'0')} — ${i>=8&&i<12?'کسر را ساده کن':'حاصل عبارت را محاسبه کن'}. مراحل را ثبت کن و پاسخ نهایی را به صورت کسر ساده با مخرج مثبت بنویس.`,
})));
let state=initialState();
const key=`math-scratchpad-${bankId}`;
try { const raw=localStorage.getItem(key); if(raw){const saved=validateSession(JSON.parse(raw));if(saved.doc.exercises.length===20 && saved.doc.exercises.every((e,i)=>e.source===rows[i][1]&&e.prompt?.includes(bankId)))state={...state,...saved};} } catch {}
const store=makeStore(state);
if(!state.doc.exercises[0]?.prompt?.includes(bankId)) store.dispatch(actions.startFractionRound());
store.dispatch(actions.keyboard(true));
store.dispatch(actions.notice(`${bankId} | App commit 1b09f87e59133f7dee7d98ec137af5a67f8558e6 | Check copies only. Export Session JSON when submitting.`));
let pending: ReturnType<typeof setTimeout>;
store.subscribe(()=>{clearTimeout(pending);pending=setTimeout(()=>{try{localStorage.setItem(key,serialize(store.getState()));}catch{}},180);});
createRoot(document.getElementById('math-scratchpad-redux')!).render(<Provider store={store}><App/></Provider>);
