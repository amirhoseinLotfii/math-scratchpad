import { useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '../../../shared/ui/button';
export function MathTools({ wide, canUndo, canRedo, onUndo, onRedo, onInsert, onMore }: {
 wide:boolean;canUndo:boolean;canRedo:boolean;onUndo:()=>void;onRedo:()=>void;onInsert:(kind:string)=>void;onMore:()=>void;
}) {
 const root=useRef<HTMLDivElement>(null),[active,setActive]=useState('fraction');
 const tools=[
  {key:'undo',label:'Undo',name:'Undo',disabled:!canUndo,run:onUndo},
  {key:'redo',label:'Redo',name:'Redo',disabled:!canRedo,run:onRedo},
  ...[{key:'fraction',label:'Fraction'},{key:'number',label:'Number'},{key:'root',label:'Root'},{key:'power',label:'Power'},{key:'group',label:'Parentheses'},...['+','−','×','÷','='].map(key=>({key,label:key}))].map(t=>({...t,name:`Insert ${t.key==='group'?'parentheses':t.key==='root'?'square root':t.key==='number'?'number':t.key==='power'?'power':t.key==='fraction'?'fraction':t.key==='='?'equals':t.key}`,disabled:false,run:()=>onInsert(t.key)})),
  {key:'more',label:'More math tools',name:'More math tools',disabled:false,run:onMore}
 ];
 const current=tools.find(t=>t.key===active&&!t.disabled)?.key??tools.find(t=>!t.disabled)!.key;
 function keys(event:KeyboardEvent<HTMLDivElement>){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const buttons=Array.from(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]),at=buttons.indexOf(event.target as HTMLButtonElement);if(at<0)return;
  event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowLeft'?-1:1)+buttons.length)%buttons.length;buttons[index]?.focus();
 }
 return <div ref={root} className="math-tools-row" role="toolbar" aria-label="Math tools" data-wide={wide} onKeyDown={keys}>{tools.map(t=><Button key={t.key} aria-label={t.name} disabled={t.disabled} tabIndex={current===t.key?0:-1} onFocus={()=>setActive(t.key)} onClick={t.run}>{t.label}</Button>)}</div>;
}
