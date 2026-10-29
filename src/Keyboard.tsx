import { writeKeyboardChoice } from './shared/lib/ui-prefs';
import { useMemo, useState } from 'react';
import { Formula } from './Formula';
import { makeStructure, seq, symbolList, topics } from './model';
import { useAppDispatch, useAppSelector } from './hooks';
import { actions, activeInfo } from './store';
import { Button } from './shared/ui/button';
export function Keyboard() {
 const s = useAppSelector(s => s), dispatch = useAppDispatch();
 const [more, setMore] = useState(false);
 function focusEditor() { document.querySelector<HTMLElement>('main.scratchpad')?.focus({ preventScroll: true }); }
 function symbol(key: string) {
  if (/^[xynt]$/.test(key)) dispatch(actions.command({ type: 'identifier', value: key }));
  else if (key === 'infinity' || key === 'sigma') dispatch(actions.command({ type: 'identifier', value: key === 'sigma' ? 'σ' : '∞' }));
  else if (['≤','≥','≠','<','>'].includes(key)) dispatch(actions.command({ type: 'operator', value: key }));
  else dispatch(actions.command({ type: 'insert', value: key }));
  dispatch(actions.recentSymbol(key)); dispatch(actions.closeSymbols()); focusEditor();
 }
 const preview = useMemo(() => {
  const key = ({ Numbers:'fraction', Algebra:'abs', Functions:'f', Calculus:'integral', Matrices:'matrix2', 'Probability & stats':'choose' } as Record<string,string>)[s.topic] ?? 'fraction';
  return { key, expression: seq([makeStructure(key)]), title: symbolList.find(x => x.key === key)!.title };
 }, [s.topic]);
 const item = activeInfo(s.doc), parentAvailable = !!item?.ancestors.length;
 const lookup = (key: string) => symbolList.find(x => x.key === key);
 const shortcuts = s.prefs.favorites.map(lookup).filter(x => !!x);
 return <section className="math-keyboard" aria-label="Math keyboard" dir="ltr">
  <div className="keyboard-toolbar">
   <Button aria-expanded={s.symbolsOpen} onClick={() => dispatch(actions.symbols())}><span aria-hidden="true">π</span> Symbols</Button>
   <Button aria-expanded={more} onClick={() => setMore(!more)}><span aria-hidden="true">⠿</span> More tools</Button>
   <Button aria-label="Backspace" onClick={() => { dispatch(actions.command({ type: 'backspace' })); focusEditor(); }}><span aria-hidden="true">⌫</span> Backspace</Button>
  </div>
    {s.symbolsOpen && <div className="symbols-panel"><div className="panel-heading"><h2>Symbols</h2><span className="small">Find by topic</span></div>
      {shortcuts.length > 0 && <div className="symbol-shortcuts"><p className="small">Favorites</p><div className="shortcut-list">{shortcuts.map(x => <button type="button" key={x.key} aria-label={`Insert favorite ${x.title}`} onClick={() => symbol(x.key)}>{x.label}</button>)}</div></div>}
      <div className="topic-list" aria-label="Symbol topics">{Object.keys(topics).map(t => <button type="button" key={t} aria-pressed={s.topic === t} onClick={() => dispatch(actions.topic(t))}>{t}</button>)}</div>
      {s.prefs.recent.length > 0 && <><p className="small">Recent</p><div className="shortcut-list">{s.prefs.recent.map(lookup).filter(x => !!x).map(x => <button type="button" key={x.key} aria-label={`Insert recent ${x.title}`} onClick={() => symbol(x.key)}>{x.label}</button>)}</div></>}
      <p className="small">{s.topic} · tap ☆ to save a favorite</p>
      <div className="symbols-layout"><div className="symbol-list">{(topics[s.topic] ?? topics.Numbers).map(x => <div className="symbol-item" key={x.key}>
        <button type="button" aria-label={`Insert ${x.title}`} onClick={() => symbol(x.key)}><span>{x.label}</span><span className="small">{x.title}</span></button>
        <button type="button" aria-label={`Favorite ${x.title}`} aria-pressed={s.prefs.favorites.includes(x.key)} onClick={() => dispatch(actions.favorite(x.key))}>{s.prefs.favorites.includes(x.key) ? '★' : '☆'}</button>
      </div>)}</div><aside className="template-preview" aria-label="Editable template preview"><p className="eyebrow">EDITABLE TEMPLATE</p><h3>{preview.title}</h3><div className="preview-formula"><Formula sequence={preview.expression} stepId="template-preview" readOnly top /></div><p className="small">Insert a template, then fill its fields with Next field (under More tools).</p><button type="button" className="primary" onClick={() => symbol(preview.key)}>Insert template</button><p className="small">Notation tools, not an automatic solver.</p></aside></div>
    </div>}

  {!s.symbolsOpen && <div className="key-grid" role="group" aria-label="Numeric keys">{['1','2','3','÷','4','5','6','×','7','8','9','−','0','.','Fraction','+'].map(key => <Button key={key} className={/^[0-9.]$/.test(key) ? 'number-key' : 'operator-key'} onClick={() => {
   if (key === 'Fraction') dispatch(actions.command({ type:'insert', value:'fraction' }));
   else dispatch(actions.command({ type: /^[0-9.]$/.test(key) ? 'digit' : 'operator', value:key }));
   focusEditor();
  }}>{key}</Button>)}</div>}
  {more && <div className="more-tools-panel">
   <div className="navigation-grid"><Button aria-label="Move left" onClick={() => { dispatch(actions.horizontal(-1)); focusEditor(); }}>←</Button><Button aria-label="Move right" onClick={() => { dispatch(actions.horizontal(1)); focusEditor(); }}>→</Button><Button aria-label="Next field" onClick={() => { dispatch(actions.next()); focusEditor(); }}>Next field</Button></div>
   <div className="editing-tools"><Button disabled={!s.past.some(d => d.exerciseId === s.doc.exerciseId)} onClick={() => { dispatch(actions.undo()); focusEditor(); }}>Undo</Button><Button disabled={!s.future.some(d => d.exerciseId === s.doc.exerciseId)} onClick={() => { dispatch(actions.redo()); focusEditor(); }}>Redo</Button><Button disabled={!parentAvailable} onClick={() => { dispatch(actions.selectParent()); focusEditor(); }}>{s.doc.cursor.selected ? 'Parent' : 'Structure'}</Button><Button onClick={() => { dispatch(actions.command({ type:'deleteStructure' })); focusEditor(); }}>Delete Item</Button><Button disabled={!s.structureClipboard} onClick={() => { dispatch(actions.command({ type:'paste' })); focusEditor(); }}>Paste</Button><Button onClick={() => { writeKeyboardChoice(false); dispatch(actions.keyboard(false)); }}>Hide keys</Button></div>
   <Button aria-pressed={s.prefs.compact} onClick={() => dispatch(actions.compact())}>{s.prefs.compact ? 'Compact' : 'Full keys'}</Button>
  </div>}
  {s.doc.cursor.selected && <div className="structure-selection"><p className="structure-label">Whole structure selected</p><div className="toolbar" aria-label="Selected structure actions"><Button onClick={() => dispatch(actions.copyStructure())}>Copy</Button><Button onClick={() => { dispatch(actions.command({type:'cut'})); focusEditor(); }}>Cut</Button><Button onClick={() => { dispatch(actions.command({type:'duplicate'})); focusEditor(); }}>Duplicate</Button><Button onClick={() => { dispatch(actions.command({type:'deleteStructure'})); focusEditor(); }}>Delete</Button></div></div>}
 </section>;
}
