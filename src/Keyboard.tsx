import { symbolList, topics } from './model';
import { useAppDispatch, useAppSelector } from './hooks';
import { actions, activeInfo } from './store';
export function Keyboard() {
  const s = useAppSelector(s => s), dispatch = useAppDispatch();
  function symbol(key: string) {
    if (/^[xynt]$/.test(key)) dispatch(actions.command({ type: 'identifier', value: key }));
    else if (key === 'infinity' || key === 'sigma') dispatch(actions.command({ type: 'identifier', value: key === 'sigma' ? 'σ' : '∞' }));
    else if (['≤', '≥', '≠', '<', '>'].includes(key)) dispatch(actions.command({ type: 'operator', value: key }));
    else dispatch(actions.command({ type: 'insert', value: key }));
    dispatch(actions.recentSymbol(key));
    dispatch(actions.closeSymbols());
  }
  const item = activeInfo(s.doc), parentAvailable = !!item?.ancestors.length;
  const lookup = (key: string) => symbolList.find(x => x.key === key);
  const shortcuts = s.prefs.favorites.length ? s.prefs.favorites.map(lookup).filter(x => !!x) : [];
  return <section className="math-keyboard" aria-label="Math keyboard" dir="ltr">
    <div className="toolbar">
      <button type="button" aria-expanded={s.symbolsOpen} onClick={() => dispatch(actions.symbols())}>Symbols</button>
      <button type="button" aria-pressed={s.prefs.compact} onClick={() => dispatch(actions.compact())}>{s.prefs.compact ? 'Compact' : 'Full keys'}</button>
      <button type="button" onClick={() => dispatch(actions.keyboard(false))}>Hide keys</button>
    </div>
    {s.symbolsOpen && <div className="symbols-panel">
      <div className="topic-list" aria-label="Symbol topics">{Object.keys(topics).map(t => <button type="button" key={t} aria-pressed={s.topic === t} onClick={() => dispatch(actions.topic(t))}>{t}</button>)}</div>
      {s.prefs.recent.length > 0 && <><p className="small">Recent</p><div className="shortcut-list">{s.prefs.recent.map(lookup).filter(x => !!x).map(x => <button type="button" key={x.key} aria-label={`Insert recent ${x.title}`} onClick={() => symbol(x.key)}>{x.label}</button>)}</div></>}
      <p className="small">{s.topic} · tap ☆ to save a favorite</p>
      <div className="symbol-list">{(topics[s.topic] ?? topics.Numbers).map(x => <div className="symbol-item" key={x.key}>
        <button type="button" aria-label={`Insert ${x.title}`} onClick={() => symbol(x.key)}><span>{x.label}</span><span className="small">{x.title}</span></button>
        <button type="button" aria-label={`Favorite ${x.title}`} aria-pressed={s.prefs.favorites.includes(x.key)} onClick={() => dispatch(actions.favorite(x.key))}>{s.prefs.favorites.includes(x.key) ? '★' : '☆'}</button>
      </div>)}</div>
    </div>}
    {!s.symbolsOpen && <>
      {shortcuts.length > 0 && <div className="shortcut-list" aria-label="Favorite symbols">{shortcuts.map(x => <button type="button" key={x.key} aria-label={`Insert favorite ${x.title}`} onClick={() => symbol(x.key)}>{x.label}</button>)}</div>}
      {!s.prefs.compact && <div className="key-grid">{['x', 'y', 'n', 't'].map(k => <button type="button" key={k} onClick={() => symbol(k)}>{k}</button>)}</div>}
      <div className="key-grid" aria-label="Numeric keys">{['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '=', '+'].map(k => <button type="button" className={/[0-9.]/.test(k) ? 'number-key' : 'operator-key'} key={k} onClick={() => dispatch(actions.command({ type: /[0-9.]/.test(k) ? 'digit' : 'operator', value: k }))}>{k}</button>)}</div>
      <div className="navigation-grid">
        <button type="button" aria-label="Move left" onClick={() => dispatch(actions.move(-1))}>←</button>
        <button type="button" aria-label="Move right" onClick={() => dispatch(actions.move(1))}>→</button>
        <button type="button" aria-label="Backspace" onClick={() => dispatch(actions.command({ type: 'backspace' }))}>⌫</button>
        <button type="button" aria-label="Next field" onClick={() => dispatch(actions.next())}>Next</button>
      </div>
    </>}
    <div className="toolbar editing-tools">
      <button type="button" disabled={!s.past.length} onClick={() => dispatch(actions.undo())}>Undo</button>
      <button type="button" disabled={!s.future.length} onClick={() => dispatch(actions.redo())}>Redo</button>
      <button type="button" disabled={!parentAvailable} onClick={() => dispatch(actions.selectParent())}>{s.doc.cursor.selected ? 'Parent' : 'Structure'}</button>
      <button type="button" disabled={!s.structureClipboard} onClick={() => dispatch(actions.command({ type: 'paste' }))}>Paste</button>
    </div>
    {s.doc.cursor.selected && <div className="toolbar structure-tools" aria-label="Selected structure actions">
      <button type="button" onClick={() => dispatch(actions.copyStructure())}>Copy</button>
      <button type="button" onClick={() => dispatch(actions.command({ type: 'cut' }))}>Cut</button>
      <button type="button" onClick={() => dispatch(actions.command({ type: 'duplicate' }))}>Duplicate</button>
      <button type="button" onClick={() => dispatch(actions.command({ type: 'deleteStructure' }))}>Delete</button>
    </div>}
  </section>;
}
