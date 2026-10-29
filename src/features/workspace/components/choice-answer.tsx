import type { RefObject, KeyboardEvent } from 'react';
import { Button } from '../../../shared/ui/button';
export function ChoiceAnswer({choices,value,onChange,firstRef}:{choices:string[];value?:string;onChange:(value:string)=>void;firstRef:RefObject<HTMLButtonElement|null>}){
 function move(e:KeyboardEvent<HTMLDivElement>){
  const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')), at=buttons.indexOf(e.target as HTMLButtonElement);
  if(at<0||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
  e.preventDefault();const index=e.key==='Home'?0:e.key==='End'?buttons.length-1:(at+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)+buttons.length)%buttons.length;
  onChange(choices[index]);buttons[index]?.focus();
 }
 return <div className="answer-choices" role="radiogroup" aria-label="Answer choices" onKeyDown={move}>{choices.map((choice,i)=><Button key={choice} ref={i===0?firstRef:undefined} role="radio" aria-checked={choice===value} tabIndex={value?choice===value?0:-1:i===0?0:-1} className={choice===value?'answer-selected':''} onClick={()=>onChange(choice)} dir="auto">{choice}</Button>)}</div>;
}
