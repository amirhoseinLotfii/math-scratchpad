import { ascii, blankStep, frac, leaves, num, op, seq, uid, type Document, type Exercise, type MathNode, type Sequence } from './model';
import { diagnosticQuestions } from './diagnostic';

type Bag = Record<string, unknown>;
type LegacyToken = { t?: unknown; n?: unknown; d?: unknown; v?: unknown };
function object(x: unknown): Bag {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw Error('Legacy session contains invalid objects.');
  return x as Bag;
}
function text(x: unknown) { return typeof x === 'string' ? ascii(x).trim() : ''; }
function mathField(value: string, warnings: string[], label: string): Sequence {
  const s = value.replace(/[−–]/g, '-');
  if (!s) return seq();
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(s) || s.length > 60) {
    warnings.push(label + ': ' + value.slice(0, 100));
    return seq();
  }
  if (s.startsWith('-')) return seq([op('−'), num(s.slice(1))]);
  return seq([num(s)]);
}
function tokensToSequence(source: unknown, warnings: string[], label: string): Sequence {
  if (!Array.isArray(source) || source.length > 200) throw Error('Invalid legacy tokens.');
  const nodes: MathNode[] = [];
  source.forEach((raw, index) => {
    const t = object(raw) as LegacyToken;
    const loc = label + ', token ' + (index + 1);
    if (t.t === 'f') {
      nodes.push(frac(mathField(text(t.n), warnings, loc + ' numerator'), mathField(text(t.d), warnings, loc + ' denominator')));
    } else if (t.t === 'n') {
      const field = mathField(text(t.v), warnings, loc + ' number');
      nodes.push(...field.children);
    } else if (t.t === 'o') {
      const val = ({ '-': '−', '*': '×', '/': '÷' } as Record<string, string>)[text(t.v)] || text(t.v);
      if (['+', '−', '×', '÷', '=', '<', '>', '≤', '≥', '≠'].includes(val)) nodes.push(op(val));
      else warnings.push(loc + ': unsupported operator ' + String(t.v).slice(0, 30));
    } else {
      warnings.push(loc + ': unsupported structure');
    }
  });
  return seq(nodes.length ? nodes : [num()]);
}
/**
 * Import older ChatGPT-widget 30-question sessions without bundling the user's
 * answers in the repository. Unsupported free text is retained as migration
 * notes and marked for manual review; it is never silently scored as zero.
 */
export function migrateChatDiagnosticSession(input: unknown): { doc: Document } | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Bag;
  if (raw.version !== 2 || !('items' in raw)) return null;
  if (!Array.isArray(raw.items) || raw.items.length !== 30) throw Error('Expected 30 legacy responses.');
  const exercises: Exercise[] = raw.items.map((entry, i) => {
    const record = object(entry), notes: string[] = [];
    const oldSteps = record.steps;
    if (!Array.isArray(oldSteps) || !oldSteps.length || oldSteps.length > 40) throw Error('Invalid legacy steps.');
    const steps = oldSteps.map((old, j) => {
      const st = object(old), step = blankStep();
      step.expression = tokensToSequence(st.tokens, notes, 'Step ' + (j + 1));
      step.final = st.final === true;
      return step;
    });
    let marked = false;
    for (const step of steps) {
      if (step.final && marked) step.final = false;
      if (step.final) marked = true;
    }
    const q = diagnosticQuestions[i];
    return {
      id: uid(), source: q.source, mode: 'math', prompt: q.stem,
      diagnosticId: q.id, confidence: ['high','medium','low'].includes(String(record.confidence))
        ? record.confidence as Exercise['confidence'] : undefined,
      skipped: record.skip === true, steps,
      ...(notes.length ? { migrationNotes: notes.join('\n').slice(0, 5000) } : {})
    };
  });
  const current = Number(raw.ix), index = Number.isInteger(current) ? Math.max(0, Math.min(29, current)) : 0;
  const ex = exercises[index], step = ex.steps.at(-1)!, leaf = leaves(step.expression)[0]?.node;
  const doc: Document = { exercises, exerciseId: ex.id, cursor: {
    stepId: step.id, nodeId: leaf?.id || null, sequenceId: null, index: 0, offset: 0, selected: null
  } };
  return { doc };
}
