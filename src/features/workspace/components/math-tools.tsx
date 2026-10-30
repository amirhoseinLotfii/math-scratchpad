import { Undo2, Redo2, MoreHorizontal } from 'lucide-react';
import { Button } from '../../../shared/ui/button';
export function MathTools({ wide, canUndo, canRedo, onUndo, onRedo, onInsert, onMore, moreOpen }: {
 wide:boolean;canUndo:boolean;canRedo:boolean;onUndo:()=>void;onRedo:()=>void;onInsert:(kind:string)=>void;onMore:()=>void;moreOpen?:boolean;
}) {
 return <div className="math-tools-row">
  <div className="wide-history-tools" role="group" aria-label="Edit history"><Button aria-label="Undo" title="Undo" disabled={!canUndo} onClick={onUndo}><Undo2 aria-hidden="true" />{wide && 'Undo'}</Button><Button aria-label="Redo" title="Redo" disabled={!canRedo} onClick={onRedo}><Redo2 aria-hidden="true" />{wide && 'Redo'}</Button></div>
  <div className="quick-math-tools" role="group" aria-label="Quick math tools">{[
   {label:'Insert fraction',kind:'fraction',glyph:<svg className="math-tool-icon" viewBox="0 0 36 38" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M21 5c-8-5-10 9-3 7l4-3M22 3l-2 10M7 18h22M15 22l-2 12c12 4 13-14 1-5" /></svg>},
   {label:'Insert parentheses',kind:'group',glyph:'( )'}, {label:'Insert square root',kind:'root',glyph:'√'},
   {label:'Insert power',kind:'power',glyph:<svg className="math-tool-icon" viewBox="0 0 36 38" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 14l13 17M21 14L8 31M24 7q8-6 8 0q0 3-8 9h8" /></svg>},
   {label:'Insert equals',kind:'=',glyph:'='},
  ].map(tool=><Button key={tool.kind} title={tool.label} aria-label={tool.label} onClick={()=>onInsert(tool.kind)}><span aria-hidden="true">{tool.glyph}</span></Button>)}</div>
  <Button className="wide-more-tools" aria-label="More math tools" aria-expanded={moreOpen} title="More math tools" onClick={onMore}><MoreHorizontal aria-hidden="true" /><span>{wide ? 'More math tools' : 'More'}</span></Button>
 </div>;
}
