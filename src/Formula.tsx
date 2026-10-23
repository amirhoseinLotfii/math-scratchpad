import { Fragment, type MouseEvent } from 'react';
import { fields, type MathNode, type Sequence } from './model';
import { useAppDispatch, useAppSelector } from './hooks';
import { actions } from './store';
type Props = { sequence: Sequence; stepId: string; path?: string; top?: boolean; readOnly?: boolean };

export function Formula({ sequence, stepId, path = '', top = false, readOnly = false }: Props) {
  const dispatch = useAppDispatch(); const cursor = useAppSelector(s => s.doc.cursor);
  function gap(index: number) {
    const active = cursor.stepId === stepId && cursor.sequenceId === sequence.id && cursor.index === index;
    return <button type="button" className={`math-gap ${active ? 'at-gap' : ''}`} aria-label={`${path} Insert ${index === 0 ? 'before' : 'after'} item ${Math.max(1, index)}`} data-gap-index={index} data-sequence-id={sequence.id}
      onClick={() => dispatch(actions.select({ stepId, sequenceId: sequence.id, index }))}><span aria-hidden="true">{active ? '│' : '·'}</span></button>;
  }
  function leafClick(e: MouseEvent<HTMLButtonElement>, n: MathNode) {
    if (n.type !== 'number' && n.type !== 'identifier' && n.type !== 'operator') return;
    let offset = n.value.length;
    if (e.detail > 0 && n.type === 'number') {
      const chars = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-digit]'));
      offset = chars.length;
      for (let i = 0; i < chars.length; i++) { const r = chars[i].getBoundingClientRect(); if (e.clientX < r.left + r.width / 2) { offset = i; break; } }
    }
    dispatch(actions.select({ stepId, nodeId: n.id, offset }));
  }
  function renderNode(n: MathNode, index: number) {
    const selected = !readOnly && cursor.stepId === stepId && cursor.selected === n.id;
    const label = n.type === 'fraction' ? `Fraction ${sequence.children.slice(0, index + 1).filter(x => x.type === 'fraction').length}` : n.type === 'template' ? n.kind : n.type;
    const field = (s: Sequence, name: string) => <Formula sequence={s} stepId={stepId} path={`${path} / ${label} ${name}`} readOnly={readOnly} />;
    if (!fields(n).length && 'value' in n) {
      if (readOnly) return <span className={`math-token readonly-token ${n.type}`}><span>{n.value || '□'}</span></span>;
      const active = cursor.stepId === stepId && cursor.nodeId === n.id && !cursor.selected && !cursor.sequenceId;
      return <button type="button" className={`math-token ${active ? 'token-active' : ''} ${n.type}`} aria-label={`${path} ${n.type} ${n.value || 'empty'}`.trim()} aria-pressed={active} data-node-id={n.id}
        onClick={e => leafClick(e, n)}>
        {n.type === 'number' ? (n.value ? [...n.value].map((c, i) => <Fragment key={i}>{active && cursor.offset === i && <span className="caret" aria-hidden="true" />}<span data-digit={i}>{c}</span></Fragment>) : <span className="placeholder">□</span>) : n.value}
        {active && n.type === 'number' && cursor.offset === n.value.length && <span className="caret" aria-hidden="true" />}
      </button>;
    }
    let content;
    if (n.type === 'fraction') content = <span className="fraction"><span className="numerator">{field(n.numerator, 'Numerator')}</span><span>{field(n.denominator, 'Denominator')}</span></span>;
    else if (n.type === 'power') content = <span className="power">{field(n.base, 'Base')}<sup>{field(n.exponent, 'Exponent')}</sup></span>;
    else if (n.type === 'root') content = <span className="radical"><span aria-hidden="true">√</span><span className="radicand">{field(n.body, 'Radicand')}</span></span>;
    else if (n.type === 'group') content = <span className="group"><span aria-hidden="true">(</span>{field(n.body, 'Parentheses')}<span aria-hidden="true">)</span></span>;
    else if (n.type === 'matrix') content = <span className="matrix-scroll"><span className="matrix" style={{ gridTemplateColumns: `repeat(${n.size}, max-content)` }}>{n.cells.map((cell, i) => <span key={cell.id}>{field(cell, `Row ${Math.floor(i / n.size) + 1} column ${i % n.size + 1}`)}</span>)}</span></span>;
    else if (n.type === 'template') {
      const fs = fields(n), a = n.args.map((s, i) => <Fragment key={s.id}>{field(s, fs[i][1])}</Fragment>);
      if (n.kind === 'integral' || n.kind === 'sum') content = <span className="group"><span className="limits"><span>{a[1]}</span><span className="large-glyph">{n.kind === 'integral' ? '∫' : 'Σ'}</span><span>{a[0]}</span></span>{a[2]}{n.kind === 'integral' && <><span aria-hidden="true">d</span>{a[3]}</>}</span>;
      else if (n.kind === 'limit') content = <span className="group"><span className="limits"><span>lim</span><span className="group">{a[0]}<span>→</span>{a[1]}</span></span>{a[2]}</span>;
      else if (n.kind === 'derivative') content = <span className="group"><span className="fraction"><span className="numerator">d</span><span className="group">d{a[1]}</span></span>{a[0]}</span>;
      else if (n.kind === 'choose') content = <span className="group">(<span className="limits">{a[0]}{a[1]}</span>)</span>;
      else if (n.kind === 'percent' || n.kind === 'factorial') content = <span className="group">{a[0]}{n.kind === 'percent' ? '%' : '!'}</span>;
      else if (n.kind === 'abs') content = <span className="group">|{a[0]}|</span>;
      else if (n.kind === 'mean') content = <span className="radicand">{a[0]}</span>;
      else content = <span className="group"><span>{n.kind === 'probability' ? 'P' : n.kind}</span>({a[0]})</span>;
    }
    return <span className={`math-structure ${selected ? 'structure-selected' : ''}`} data-structure-id={n.id}>{content}</span>;
  }
  // Operators start a new wrapping unit so each remains attached to its right-hand term.
  const chunks: { node: MathNode; index: number }[][] = [];
  sequence.children.forEach((node, index) => { if (!chunks.length || (top && node.type === 'operator')) chunks.push([]); chunks.at(-1)!.push({ node, index }); });
  return <span dir="ltr" className={`math-sequence ${top ? 'top-sequence' : ''}`} data-sequence={sequence.id}>
    {(!readOnly && (top || (cursor.stepId === stepId && cursor.sequenceId === sequence.id && cursor.index === 0))) && gap(0)}
    {chunks.map((chunk, i) => <span className="math-chunk" key={i}>{chunk.map(({ node, index }) => <Fragment key={node.id}>{renderNode(node, index)}{(!readOnly && ((top && fields(node).length > 0) || (cursor.stepId === stepId && cursor.sequenceId === sequence.id && cursor.index === index + 1))) && gap(index + 1)}</Fragment>)}</span>)}
  </span>;
}
