import { metadataSchema } from './features/session/schemas/session-schema';
import { ascii, fields, leaves, templateCounts, type Cursor, type Document, type Exercise, type MathNode, type Preferences, type Sequence } from './model';
import { initialState, type ScratchState } from './store';
const KEY = 'math-scratchpad-redux-v2';
type Bag = Record<string, any>;
/** Reconstruct a bounded allowlisted tree, discarding all unknown fields. */
export function validateSession(input: unknown): { doc: Document; prefs?: Preferences } {
  const data = input as Bag;
  if (!data || ![1, 2].includes(data.version)) throw Error('Unsupported session version.');
  const raw = data.version === 1 ? { ...data.state, exerciseId: data.state?.exercise } : data.doc;
  if (!raw || !Array.isArray(raw.exercises) || !raw.exercises.length || raw.exercises.length > 40) throw Error('Invalid session.');
  const ids = new Set<string>(); let count = 0;
  function id(v: unknown): string { if (typeof v !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(v) || ids.has(v)) throw Error('Invalid or duplicate ID.'); ids.add(v); return v; }
  function sequence(v: Bag, depth: number): Sequence {
    if (!v || v.type !== 'sequence' || depth > 18 || !Array.isArray(v.children) || !v.children.length || v.children.length > 200 || ++count > 3000) throw Error('Invalid sequence.');
    return { id: id(v.id), type: 'sequence', children: v.children.map((x: Bag) => node(x, depth + 1)) };
  }
  function node(v: Bag, depth: number): MathNode {
    if (!v || depth > 18 || ++count > 3000) throw Error('Session is too complex.');
    const nodeId = id(v.id);
    if (v.type === 'number' && typeof v.value === 'string' && /^[0-9.]{0,60}$/.test(v.value)) return { id: nodeId, type: 'number', value: v.value };
    if (v.type === 'identifier' && typeof v.value === 'string' && /^[a-zA-Zπθ∞σ]$/.test(v.value)) return { id: nodeId, type: 'identifier', value: v.value };
    if (v.type === 'operator' && ['+', '−', '×', '÷', '=', '<', '>', '≤', '≥', '≠'].includes(v.value)) return { id: nodeId, type: 'operator', value: v.value };
    if (v.type === 'fraction') return { id: nodeId, type: 'fraction', numerator: sequence(v.numerator, depth + 1), denominator: sequence(v.denominator, depth + 1) };
    if (v.type === 'power') return { id: nodeId, type: 'power', base: sequence(v.base, depth + 1), exponent: sequence(v.exponent, depth + 1) };
    if (v.type === 'root' || v.type === 'group') return { id: nodeId, type: v.type, body: sequence(v.body, depth + 1) };
    if (v.type === 'matrix' && [2, 3].includes(v.size) && Array.isArray(v.cells) && v.cells.length === v.size * v.size) return { id: nodeId, type: 'matrix', size: v.size, cells: v.cells.map((x: Bag) => sequence(x, depth + 1)) };
    if (v.type === 'template' && Object.hasOwn(templateCounts, v.kind) && Array.isArray(v.args) && v.args.length === templateCounts[v.kind]) return { id: nodeId, type: 'template', kind: v.kind, args: v.args.map((x: Bag) => sequence(x, depth + 1)) };
    throw Error('Invalid mathematical content.');
  }
  const exercises: Exercise[] = raw.exercises.map((ex: Bag) => {
    metadataSchema.parse(ex);
    if (typeof ex.source !== 'string' || ex.source.length > 4000 || !['math', 'text'].includes(ex.mode) || !Array.isArray(ex.steps) || !ex.steps.length || ex.steps.length > 40) throw Error('Invalid exercise.');
    if (ex.steps.filter((s: Bag) => s.final).length > 1) throw Error('Only one final answer is allowed.');
    return { id: id(ex.id), source: ex.mode === 'math' ? ascii(ex.source) : ex.source, mode: ex.mode, ...(typeof ex.prompt === 'string' && ex.prompt.length < 4000 ? { prompt: ex.prompt } : {}), ...(Number.isInteger(ex.diagnosticId) && ex.diagnosticId >= 1 && ex.diagnosticId <= 30 ? { diagnosticId: ex.diagnosticId } : {}), ...(ex.assessment === 'fractions-round-1' ? { assessment: 'fractions-round-1' as const } : {}), ...(Number.isFinite(ex.elapsedMs) && ex.elapsedMs >= 0 ? { elapsedMs: ex.elapsedMs } : {}), ...( ['high','medium','low'].includes(ex.confidence) ? { confidence: ex.confidence } : {}), ...(ex.skipped === true ? { skipped: true } : {}), ...(typeof ex.migrationNotes === 'string' && ex.migrationNotes.length <= 5000 ? { migrationNotes: ex.migrationNotes } : {}), steps: ex.steps.map((s: Bag) => ({ id: id(s.id), expression: sequence(s.expression, 0), final: s.final === true, ...(s.edited === true ? { edited: true } : {}), status: s.status === 'needs-review' ? 'needs-review' : 'unchecked' })) };
  });
  const ex = exercises.find(x => x.id === raw.exerciseId) ?? exercises.at(-1)!;
  const old = data.version === 1 ? { stepId: raw.step, nodeId: raw.node, offset: raw.caret, sequenceId: raw.gap?.sequenceId, index: raw.gap?.index } : raw.cursor ?? {};
  const step = ex.steps.find(s => s.id === old.stepId) ?? ex.steps.at(-1)!;
  const all = leaves(step.expression); const leaf = all.find(x => x.node.id === old.nodeId)?.node ?? all[0].node;
  const cursor: Cursor = { stepId: step.id, nodeId: leaf.id, offset: leaf.type === 'number' && Number.isInteger(old.offset) ? Math.max(0, Math.min(leaf.value.length, old.offset)) : 0, sequenceId: null, index: 0, selected: null };
  // Restore only verified structural selections and sequence boundaries.
  function sequences(s: Sequence): Sequence[] { return [s, ...s.children.flatMap(n => fields(n).flatMap(([child]) => sequences(child)))]; }
  const gap = sequences(step.expression).find(s => s.id === old.sequenceId);
  if (gap && Number.isInteger(old.index) && old.index >= 0 && old.index <= gap.children.length) { cursor.sequenceId = gap.id; cursor.index = old.index; cursor.nodeId = null; }
  const prefs = data.prefs;
  return { doc: { exercises, exerciseId: ex.id, cursor }, prefs: prefs ? { compact: prefs.compact !== false, favorites: Array.isArray(prefs.favorites) ? prefs.favorites.filter((x: unknown) => typeof x === 'string' && x.length < 30).slice(0, 12) : [], recent: Array.isArray(prefs.recent) ? prefs.recent.filter((x: unknown) => typeof x === 'string' && x.length < 30).slice(0, 4) : [] } : undefined };
}
export function restoreState(): ScratchState {
  const state = initialState();
  try { const raw = localStorage.getItem(KEY) ?? localStorage.getItem('math-scratchpad-flow-v1'); if (raw) { const saved = validateSession(JSON.parse(raw)); state.doc = saved.doc; if (saved.prefs) state.prefs = saved.prefs; state.keyboardOpen = JSON.parse(raw).keyboardOpen === true; } } catch { state.notice = 'Previous draft could not be restored. Import a session backup if available.'; }
  return state;
}
export const serialize = (state: ScratchState) => JSON.stringify({ version: 2, doc: state.doc, prefs: state.prefs, keyboardOpen: state.keyboardOpen }, null, 2);
export function saveState(state: ScratchState): boolean { try { localStorage.setItem(KEY, serialize(state)); return true; } catch { return false; } }
