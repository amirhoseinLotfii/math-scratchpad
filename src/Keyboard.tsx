import { writeKeyboardChoice } from './shared/lib/ui-prefs';
import { useMemo, useState } from 'react';
import { Formula } from './Formula';
import { makeStructure, seq, symbolList, topics } from './model';
import { useAppDispatch, useAppSelector } from './hooks';
import { actions } from './store';
import { Button } from './shared/ui/button';
import { duplicateMathfieldGroup, executeMathfield, insertMathSymbol, mathfieldForStep, moveMathfield, redoMathfield, undoMathfield } from './features/math-editor/mathlive-adapter';
export function Keyboard({ onFocusEditor }: { onFocusEditor?: () => void } = {}) {
 const s = useAppSelector(s => s), dispatch = useAppDispatch();
 const [more, setMore] = useState(false);
 function focusEditor() {
  if (onFocusEditor) { onFocusEditor(); return; }
  const field = mathfieldForStep(stepId);
  if (field) { field.focus(); return; }
  document.querySelector<HTMLElement>('main.scratchpad')?.focus({ preventScroll: true });
 }
 const stepId = s.doc.cursor.stepId;
 function runUndo() { if (!undoMathfield(stepId)) dispatch(actions.undo()); }
 function runRedo() { if (!redoMathfield(stepId)) dispatch(actions.redo()); }
 function symbol(key: string) {
  if (!insertMathSymbol(stepId, key)) {
   if (/^[xynt]$/.test(key)) dispatch(actions.command({ type: 'identifier', value: key }));
   else if (key === 'infinity' || key === 'sigma') dispatch(actions.command({ type: 'identifier', value: key === 'sigma' ? 'σ' : '∞' }));
   else if (['≤','≥','≠','<','>'].includes(key)) dispatch(actions.command({ type: 'operator', value: key }));
   else dispatch(actions.command({ type: 'insert', value: key }));
  }
  dispatch(actions.recentSymbol(key)); dispatch(actions.closeSymbols()); focusEditor();
 }
 const preview = useMemo(() => {
  const key = ({ Numbers:'fraction', Algebra:'abs', Functions:'f', Calculus:'integral', Matrices:'matrix2', 'Probability & stats':'choose' } as Record<string,string>)[s.topic] ?? 'fraction';
  return { key, expression: seq([makeStructure(key)]), title: symbolList.find(x => x.key === key)!.title };
 }, [s.topic]);
 const lookup = (key: string) => symbolList.find(x => x.key === key);
 const shortcuts = s.prefs.favorites.map(lookup).filter(x => !!x);
 return <section className="math-keyboard" aria-label="Math keyboard" dir="ltr">
  <div className="keyboard-toolbar">
   <Button aria-expanded={s.symbolsOpen} onClick={() => dispatch(actions.symbols())}><span aria-hidden="true">π</span> Symbols</Button>
   <Button aria-expanded={more} onClick={() => setMore(!more)}><span aria-hidden="true">⠿</span> More tools</Button>
   <Button aria-label="Backspace" onClick={() => { if (!executeMathfield(stepId, 'deleteBackward')) dispatch(actions.command({ type: 'backspace' })); focusEditor(); }}><span aria-hidden="true">⌫</span> Backspace</Button>
  </div>
    {s.symbolsOpen && <div className="symbols-panel"><div className="panel-heading"><h2>Symbols</h2><span className="small">Find by topic</span></div>
      {shortcuts.length > 0 && <div className="symbol-shortcuts"><p className="small">Favorites</p><div className="shortcut-list">{shortcuts.map(x => <button type="button" key={x.key} aria-label={`Insert favorite ${x.title}`} onClick={() => symbol(x.key)}>{x.label}</button>)}</div></div>}
      <div className="topic-list" aria-label="Symbol topics">{Object.keys(topics).map(t => <button type="button" key={t} aria-pressed={s.topic === t} onClick={() => dispatch(actions.topic(t))}>{t}</button>)}</div>
      {s.prefs.recent.length > 0 && <><p className="small">Recent</p><div className="shortcut-list">{s.prefs.recent.map(lookup).filter(x => !!x).map(x => <button type="button" key={x.key} aria-label={`Insert recent ${x.title}`} onClick={() => symbol(x.key)}>{x.label}</button>)}</div></>}
      <p className="small">{s.topic} · tap ☆ to save a favorite</p>
      <div className="symbols-layout"><div className="symbol-list">{(topics[s.topic] ?? topics.Numbers).map(x => <div className="symbol-item" key={x.key}>
        <button type="button" aria-label={`Insert ${x.title}`} onClick={() => symbol(x.key)}><span>{x.label}</span><span className="small">{x.title}</span></button>
        <button type="button" aria-label={`Favorite ${x.title}`} aria-pressed={s.prefs.favorites.includes(x.key)} onClick={() => dispatch(actions.favorite(x.key))}>{s.prefs.favorites.includes(x.key) ? '★' : '☆'}</button>
      </div>)}</div><aside className="template-preview" aria-label="Editable template preview"><p className="eyebrow">EDITABLE TEMPLATE</p><h3>{preview.title}</h3><div className="preview-formula"><Formula sequence={preview.expression} stepId="template-preview" readOnly top /></div><p className="small">Insert a template, then fill its fields with Next.</p><button type="button" className="primary" onClick={() => symbol(preview.key)}>Insert template</button><p className="small">Notation tools, not an automatic solver.</p></aside></div>
    </div>}

  {!s.symbolsOpen && <div className="key-grid" role="group" aria-label="Numeric keys">{['1','2','3','÷','4','5','6','×','7','8','9','−','0','.','Fraction','+'].map(key => <Button key={key} className={/^[0-9.]$/.test(key) ? 'number-key' : 'operator-key'} onClick={() => {
   if (!insertMathSymbol(stepId, key === 'Fraction' ? 'fraction' : key)) {
    if (key === 'Fraction') dispatch(actions.command({ type:'insert', value:'fraction' }));
    else dispatch(actions.command({ type: /^[0-9.]$/.test(key) ? 'digit' : 'operator', value:key }));
   }
   focusEditor();
  }}>{key}</Button>)}</div>}
  {more && <div className="more-tools-panel">
   <div className="navigation-grid"><Button aria-label="Move left" onClick={() => { if (!moveMathfield(stepId, -1)) dispatch(actions.horizontal(-1)); focusEditor(); }}>←</Button><Button aria-label="Move right" onClick={() => { if (!moveMathfield(stepId, 1)) dispatch(actions.horizontal(1)); focusEditor(); }}>→</Button><Button aria-label="Next field" onClick={() => { if (!executeMathfield(stepId, 'moveToNextPlaceholder')) dispatch(actions.next()); focusEditor(); }}>Next</Button></div>
   <div className="editing-tools"><Button disabled={!mathfieldForStep(stepId)?.canUndo() && !s.past.some(d => d.exerciseId === s.doc.exerciseId)} onClick={() => { runUndo(); focusEditor(); }}>Undo</Button><Button disabled={!mathfieldForStep(stepId)?.canRedo() && !s.future.some(d => d.exerciseId === s.doc.exerciseId)} onClick={() => { runRedo(); focusEditor(); }}>Redo</Button><Button onClick={() => { if (!executeMathfield(stepId, 'selectGroup')) dispatch(actions.selectParent()); focusEditor(); }}>Parent</Button><Button onClick={() => { if (!executeMathfield(stepId, 'deleteBackward')) dispatch(actions.command({ type:'deleteStructure' })); focusEditor(); }}>Delete Item</Button><Button onClick={() => { if (!executeMathfield(stepId, 'pasteFromClipboard')) dispatch(actions.command({ type:'paste' })); focusEditor(); }}>Paste</Button><Button onClick={() => { executeMathfield(stepId, 'copyToClipboard'); focusEditor(); }}>Copy</Button><Button onClick={() => { executeMathfield(stepId, 'cutToClipboard'); focusEditor(); }}>Cut</Button><Button onClick={() => { if (!duplicateMathfieldGroup(stepId)) dispatch(actions.command({ type:'duplicate' })); focusEditor(); }}>Duplicate</Button><Button onClick={() => { writeKeyboardChoice(false); dispatch(actions.keyboard(false)); }}>Hide keys</Button></div>
   <Button aria-pressed={s.prefs.compact} onClick={() => dispatch(actions.compact())}>{s.prefs.compact ? 'Compact' : 'Full keys'}</Button>
  </div>}
  {s.doc.cursor.selected && <div className="structure-selection"><p className="structure-label">Whole structure selected</p><div className="toolbar" aria-label="Selected structure actions"><Button onClick={() => dispatch(actions.copyStructure())}>Copy</Button><Button onClick={() => { dispatch(actions.command({type:'cut'})); focusEditor(); }}>Cut</Button><Button onClick={() => { dispatch(actions.command({type:'duplicate'})); focusEditor(); }}>Duplicate</Button><Button onClick={() => { dispatch(actions.command({type:'deleteStructure'})); focusEditor(); }}>Delete</Button></div></div>}
 </section>;
}
