import type { ReactNode } from 'react';
import { Undo2, Redo2, MoreHorizontal } from 'lucide-react';
import { Button } from '../../../shared/ui/button';
import { WORKSPACE_TEMPLATE_LABELS, WORKSPACE_TEMPLATE_TOOLS, type WorkspaceTemplate } from '../model/workspace-templates';

const TOOL_DETAILS: Record<string, { label: string; glyph: ReactNode }> = {
 fraction: { label: 'Insert fraction', glyph: <svg className="math-tool-icon" viewBox="0 0 36 38" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M21 5c-8-5-10 9-3 7l4-3M22 3l-2 10M7 18h22M15 22l-2 12c12 4 13-14 1-5" /></svg> },
 group: { label: 'Insert parentheses', glyph: '( )' },
 root: { label: 'Insert square root', glyph: '√' },
 power: { label: 'Insert power', glyph: <svg className="math-tool-icon" viewBox="0 0 36 38" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 14l13 17M21 14L8 31M24 7q8-6 8 0q0 3-8 9h8" /></svg> },
 '=': { label: 'Insert equals', glyph: '=' },
 x: { label: 'Insert variable x', glyph: 'x' },
 sin: { label: 'Insert sine function', glyph: 'sin' },
 cos: { label: 'Insert cosine function', glyph: 'cos' },
 '±': { label: 'Insert plus or minus', glyph: '±' },
};

export function MathTools({ wide, canUndo, canRedo, onUndo, onRedo, onInsert, onMore, moreOpen, workspaceTemplate = 'general', onWorkspaceTemplateChange }: {
 wide:boolean;canUndo:boolean;canRedo:boolean;onUndo:()=>void;onRedo:()=>void;onInsert:(kind:string)=>void;onMore:(source:HTMLElement)=>void;moreOpen?:boolean;
 workspaceTemplate?: WorkspaceTemplate;
 onWorkspaceTemplateChange?: (template: WorkspaceTemplate) => void;
}) {
 return <div className="math-tools-row">
  <div className="wide-history-tools" role="group" aria-label="Edit history"><Button aria-label="Undo" title="Undo" disabled={!canUndo} onClick={onUndo}><Undo2 aria-hidden="true" />{wide && 'Undo'}</Button><Button aria-label="Redo" title="Redo" disabled={!canRedo} onClick={onRedo}><Redo2 aria-hidden="true" />{wide && 'Redo'}</Button></div>
  {onWorkspaceTemplateChange && <label className="workspace-template-picker">
   <span>Workspace</span>
   <select aria-label="Workspace template" value={workspaceTemplate} onChange={event => onWorkspaceTemplateChange(event.currentTarget.value as WorkspaceTemplate)}>
    {Object.entries(WORKSPACE_TEMPLATE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
   </select>
  </label>}
  <div className="quick-math-tools" role="group" aria-label="Quick math tools">{WORKSPACE_TEMPLATE_TOOLS[workspaceTemplate].map(kind => {
   const tool = TOOL_DETAILS[kind];
   return <Button key={kind} title={tool.label} aria-label={tool.label} onClick={() => onInsert(kind)}><span aria-hidden="true">{tool.glyph}</span></Button>;
  })}</div>
  <Button className="wide-more-tools" aria-label="More math tools" aria-expanded={moreOpen} title="More math tools" onClick={event=>onMore(event.currentTarget)}><MoreHorizontal aria-hidden="true" /><span>{wide ? 'More math tools' : 'More'}</span></Button>
 </div>;
}
