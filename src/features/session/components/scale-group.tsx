import { useId } from 'react';
/** Native radios retain platform arrow navigation and screen-reader semantics. */
export function ScaleGroup({label,value,onChange}:{label:string;value?:number;onChange:(value:number|undefined)=>void}) {
 const id=useId();
 return <fieldset className="scale-group"><legend>{label} (1–5)</legend><div className="scale-pills">{[1,2,3,4,5].map(n=><label key={n} className={value===n?'scale-selected':''}><input type="radio" name={id} aria-label={`${label} ${n}`} value={n} checked={value===n} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onChange(n);}}} onChange={()=>onChange(n)}/><span>{n}</span></label>)}</div><div className="scale-ends"><span>Low</span><span>High</span></div>{value!==undefined&&<button className="link-button clear-scale" onClick={()=>onChange(undefined)}>Clear {label.toLowerCase()}</button>}</fieldset>;
}
