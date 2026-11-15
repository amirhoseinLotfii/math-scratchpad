import { useMemo } from 'react';
import { Formula } from './formula';
import { makeStructure, seq, symbolList, topics } from '../../../model';
import { actions } from '../../../store';
import type { AppDispatch } from '../../../store';
import { useAppSelector } from '../../../hooks';
export function KeyboardSymbols({ symbol, dispatch }: { symbol: (key: string) => void; dispatch: AppDispatch }) {
  const { topic, prefs } = useAppSelector(({ topic, prefs }) => ({ topic, prefs }));
  const preview = useMemo(() => {
    const key =
      (
        {
          Numbers: 'fraction',
          Algebra: 'abs',
          Functions: 'f',
          Calculus: 'integral',
          Matrices: 'matrix2',
          'Probability & stats': 'choose',
        } as Record<string, string>
      )[topic] ?? 'fraction';
    return { key, expression: seq([makeStructure(key)]), title: symbolList.find((x) => x.key === key)!.title };
  }, [topic]);
  const lookup = (key: string) => symbolList.find((x) => x.key === key);
  const shortcuts = prefs.favorites.map(lookup).filter((x) => !!x);
  return (
    <div className="symbols-panel">
      <div className="panel-heading">
        <h2>Symbols</h2>
        <span className="small">Find by topic</span>
      </div>
      {shortcuts.length > 0 && (
        <div className="symbol-shortcuts">
          <p className="small">Favorites</p>
          <div className="shortcut-list">
            {shortcuts.map((x) => (
              <button type="button" key={x.key} aria-label={`Insert favorite ${x.title}`} onClick={() => symbol(x.key)}>
                {x.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="topic-list" aria-label="Symbol topics">
        {Object.keys(topics).map((t) => (
          <button type="button" key={t} aria-pressed={topic === t} onClick={() => dispatch(actions.topic(t))}>
            {t}
          </button>
        ))}
      </div>
      {prefs.recent.length > 0 && (
        <>
          <p className="small">Recent</p>
          <div className="shortcut-list">
            {prefs.recent
              .map(lookup)
              .filter((x) => !!x)
              .map((x) => (
                <button type="button" key={x.key} aria-label={`Insert recent ${x.title}`} onClick={() => symbol(x.key)}>
                  {x.label}
                </button>
              ))}
          </div>
        </>
      )}
      <p className="small">{topic} · tap ☆ to save a favorite</p>
      <div className="symbols-layout">
        <div className="symbol-list">
          {(topics[topic] ?? topics.Numbers).map((x) => (
            <div className="symbol-item" key={x.key}>
              <button type="button" aria-label={`Insert ${x.title}`} onClick={() => symbol(x.key)}>
                <span>{x.label}</span>
                <span className="small">{x.title}</span>
              </button>
              <button
                type="button"
                aria-label={`Favorite ${x.title}`}
                aria-pressed={prefs.favorites.includes(x.key)}
                onClick={() => dispatch(actions.favorite(x.key))}
              >
                {prefs.favorites.includes(x.key) ? '★' : '☆'}
              </button>
            </div>
          ))}
        </div>
        <aside className="template-preview" aria-label="Editable template preview">
          <p className="eyebrow">EDITABLE TEMPLATE</p>
          <h3>{preview.title}</h3>
          <div className="preview-formula">
            <Formula sequence={preview.expression} stepId="template-preview" readOnly top />
          </div>
          <p className="small">Insert a template, then fill its fields with Next.</p>
          <button type="button" className="primary" onClick={() => symbol(preview.key)}>
            Insert template
          </button>
          <p className="small">Notation tools, not an automatic solver.</p>
        </aside>
      </div>
    </div>
  );
}
