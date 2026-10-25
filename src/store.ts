import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { blank, blankStep, clone, example, fields, findSequence, freshNode, ident, latex, leaves, makeStructure, nodes, num, op, seq, uid, type Cursor, type Document, type Exercise, type MathNode, type Preferences, type Sequence } from './model';
import { parse } from './parser';
import { diagnosticQuestions } from './diagnostic';

export type ScratchState = {
  doc: Document; past: Document[]; future: Document[];
  prefs: Preferences; keyboardOpen: boolean; symbolsOpen: boolean; topic: string;
  structureClipboard: MathNode | null;
  copies: Record<string, string>; notice: string;
};
export function exerciseOf(doc: Document) { return doc.exercises.find(x => x.id === doc.exerciseId)!; }
export function stepOf(doc: Document) { return exerciseOf(doc).steps.find(s => s.id === doc.cursor.stepId)!; }
export function initialDocument(): Document {
  const step = blankStep(); step.expression = parse(example);
  const exercise: Exercise = { id: uid(), source: example, mode: 'math', steps: [step] };
  return { exercises: [exercise], exerciseId: exercise.id, cursor: { stepId: step.id, nodeId: leaves(step.expression)[0].node.id, sequenceId: null, index: 0, offset: 0, selected: null } };
}
export function initialState(): ScratchState {
  return { doc: initialDocument(), past: [], future: [], prefs: { compact: true, favorites: ['fraction', 'power', 'root'], recent: [] }, keyboardOpen: false, symbolsOpen: false, topic: 'Numbers', structureClipboard: null, copies: {}, notice: '' };
}
function focusNode(doc: Document, node: MathNode, offset = 0) {
  doc.cursor.nodeId = node.id; doc.cursor.sequenceId = null; doc.cursor.offset = offset; doc.cursor.selected = null;
}
function focusGap(doc: Document, sequence: Sequence, index: number) {
  doc.cursor.nodeId = null; doc.cursor.sequenceId = sequence.id; doc.cursor.index = index; doc.cursor.offset = 0; doc.cursor.selected = null;
}
function focusFirst(doc: Document, structure: MathNode | Sequence) {
  const leaf = leaves(structure.type === 'sequence' ? structure : seq([structure]))[0].node; focusNode(doc, leaf);
}
export function activeInfo(doc: Document) {
  return nodes(stepOf(doc).expression).find(x => x.node.id === (doc.cursor.selected ?? doc.cursor.nodeId));
}
function insertion(doc: Document): { parent: Sequence; index: number; replace: boolean } {
  const c = doc.cursor;
  if (c.sequenceId) { const parent = findSequence(stepOf(doc).expression, c.sequenceId)!; const target = parent.children[c.index]; return { parent, index: c.index, replace: target?.type === 'number' && target.value === '' }; }
  const item = activeInfo(doc)!;
  return { parent: item.parent, index: item.index + (item.node.type === 'number' && !item.node.value ? 0 : 1), replace: item.node.type === 'number' && !item.node.value };
}
function put(doc: Document, node: MathNode) {
  if (doc.cursor.selected) {
    const item = activeInfo(doc)!; item.parent.children.splice(item.index, 1, node); focusFirst(doc, node); return;
  }
  const { parent, index, replace } = insertion(doc); parent.children.splice(index, replace ? 1 : 0, node); focusFirst(doc, node);
}
function invalidate(doc: Document, from: number) { exerciseOf(doc).steps.forEach((s, i) => { if (i >= from) s.status = i === from ? 'unchecked' : 'needs-review'; }); }
export type Command =
  | { type: 'digit' | 'operator' | 'identifier' | 'insert'; value: string }
  | { type: 'backspace' | 'clear' | 'newStep' | 'deleteStep' | 'final' | 'duplicate' | 'cut' | 'paste' | 'deleteStructure' }
  | { type: 'newProblem' }
  | { type: 'newExercise'; source: string; mode: 'math' | 'text'; expression?: Sequence };
function applyCommand(state: ScratchState, cmd: Command) {
  const d = state.doc, ex = exerciseOf(d), current = stepOf(d), c = d.cursor;
  const item = activeInfo(d);
  if (cmd.type === 'digit') {
    if (!/^[0-9.]$/.test(cmd.value)) return;
    if (item?.node.type === 'number' && !c.selected && !c.sequenceId) {
      const n = item.node; if (n.value.length >= 60 || (cmd.value === '.' && n.value.includes('.'))) return;
      n.value = n.value.slice(0, c.offset) + cmd.value + n.value.slice(c.offset); c.offset++;
    } else { const n = num(cmd.value); put(d, n); c.offset = 1; }
  } else if (cmd.type === 'operator') {
    if (!['+', '−', '×', '÷', '=', '<', '>', '≤', '≥', '≠'].includes(cmd.value)) return;
    if (item?.node.type === 'operator' && !c.selected && !c.sequenceId) item.node.value = cmd.value;
    else {
      const position = insertion(d); const n = op(cmd.value);
      position.parent.children.splice(position.index, position.replace ? 1 : 0, n);
      const next = position.parent.children[position.index + 1];
      if (next && next.type !== 'operator') focusFirst(d, next);
      else { const value = num(); position.parent.children.splice(position.index + 1, 0, value); focusNode(d, value); }
    }
  } else if (cmd.type === 'identifier') {
    if (!/^[a-zA-Zπθ∞σ]$/.test(cmd.value)) return;
    if (item?.node.type === 'identifier' && !c.selected) item.node.value = cmd.value;
    else put(d, ident(cmd.value));
  } else if (cmd.type === 'insert') {
    const structure = makeStructure(cmd.value);
    // Wrapping an explicitly selected structure is intentional; a main-line gap creates an empty template.
    const wrap = c.selected ? item : item?.node.type !== 'operator' && !c.sequenceId && ['fraction', 'power', 'root', 'group', 'percent', 'factorial', 'abs', 'mean', 'f', 'sin', 'cos', 'tan', 'ln', 'log', 'exp', 'det', 'probability'].includes(cmd.value) ? item : undefined;
    if (wrap) {
      fields(structure)[0][0].children = [wrap.node]; wrap.parent.children.splice(wrap.index, 1, structure);
      const empty = leaves(seq([structure])).find(x => x.node.type === 'number' && !x.node.value);
      focusNode(d, empty?.node ?? leaves(seq([structure]))[0].node);
    } else put(d, structure);
    state.prefs.recent = [cmd.value, ...state.prefs.recent.filter(k => k !== cmd.value)].slice(0, 4);
    state.symbolsOpen = false;
  } else if (cmd.type === 'backspace' || cmd.type === 'deleteStructure') {
    if (item?.node.type === 'number' && c.offset > 0 && !c.selected && cmd.type === 'backspace') {
      item.node.value = item.node.value.slice(0, c.offset - 1) + item.node.value.slice(c.offset); c.offset--;
    } else if (c.selected && item) {
      item.parent.children.splice(item.index, 1);
      if (!item.parent.children.length) item.parent.children.push(num());
      focusGap(d, item.parent, Math.min(item.index, item.parent.children.length));
    } else if (c.sequenceId) {
      const parent = findSequence(current.expression, c.sequenceId)!;
      const prev = parent.children[c.index - 1];
      if (prev) { if (fields(prev).length) { c.selected = prev.id; c.nodeId = null; c.sequenceId = null; } else { parent.children.splice(--c.index, 1); if (!parent.children.length) parent.children.push(num()); } }
    } else if (item && item.node.type !== 'number') {
      item.parent.children.splice(item.index, 1); if (!item.parent.children.length) item.parent.children.push(num()); focusGap(d, item.parent, item.index);
    }
  } else if (cmd.type === 'clear') { current.expression = blank(); focusFirst(d, current.expression); }
  else if (cmd.type === 'newStep') {
    if (ex.steps.length >= 40) throw Error('Maximum 40 steps per exercise.');
    const step = blankStep(); ex.steps.push(step); c.stepId = step.id; focusFirst(d, step.expression);
  } else if (cmd.type === 'deleteStep') {
    if (ex.steps.length === 1) { current.expression = blank(); current.final = false; focusFirst(d, current.expression); }
    else { const index = ex.steps.indexOf(current); ex.steps.splice(index, 1); const next = ex.steps[Math.min(index, ex.steps.length - 1)]; c.stepId = next.id; focusFirst(d, next.expression); }
  } else if (cmd.type === 'final') { const value = !current.final; ex.steps.forEach(s => { s.final = s.id === current.id && value; }); }
  else if (cmd.type === 'cut' || cmd.type === 'duplicate') {
    if (!c.selected || !item) return;
    if (cmd.type === 'cut') {
      state.structureClipboard = clone(item.node); item.parent.children.splice(item.index, 1);
      if (!item.parent.children.length) item.parent.children.push(num()); focusGap(d, item.parent, item.index);
    } else { const copy = freshNode(item.node); item.parent.children.splice(item.index + 1, 0, copy); c.selected = copy.id; c.nodeId = null; c.sequenceId = null; }
  } else if (cmd.type === 'paste') { if (state.structureClipboard) put(d, freshNode(state.structureClipboard)); }
  else if (cmd.type === 'newProblem' || cmd.type === 'newExercise') {
    if (d.exercises.length >= 40) throw Error('Maximum 40 exercises. Export a backup before starting another session.');
    const step = blankStep(); const source = cmd.type === 'newProblem' ? latex(current.expression) : cmd.source.trim();
    if (!source || source.length > 4000) throw Error('Enter a problem (at most 4000 characters).');
    const next: Exercise = { id: uid(), source, mode: cmd.type === 'newProblem' ? 'math' : cmd.mode, steps: [step] };
    if (cmd.type === 'newExercise' && cmd.expression) step.expression = clone(cmd.expression);
    d.exercises.push(next); d.exerciseId = next.id; c.stepId = step.id; focusFirst(d, step.expression);
  }
}
const slice = createSlice({
  name: 'scratchpad', initialState: initialState(),
  reducers: {
    command(state, action: PayloadAction<Command>) {
      const before = clone(state.doc), exId = state.doc.exerciseId, index = exerciseOf(state.doc).steps.indexOf(stepOf(state.doc));
      try {
        applyCommand(state, action.payload);
        if (JSON.stringify(before) === JSON.stringify(state.doc)) return;
        state.past.push(before); if (state.past.length > 80) state.past.shift(); state.future = [];
        if (state.doc.exerciseId === exId) {
          const previousStep = exerciseOf(before).steps[index];
          const changedStep = exerciseOf(state.doc).steps.find(step => step.id === previousStep.id);
          if (changedStep && JSON.stringify(previousStep.expression) !== JSON.stringify(changedStep.expression)) {
            changedStep.edited = true; invalidate(state.doc, index);
          } else if (!changedStep) invalidate(state.doc, index);
        }
        state.notice = '';
      } catch (error) { state.doc = before; state.notice = error instanceof Error ? error.message : 'Could not edit.'; }
    },
    select(state, action: PayloadAction<Partial<Cursor> & { stepId: string }>) {
      const step = exerciseOf(state.doc).steps.find(s => s.id === action.payload.stepId); if (!step) return;
      state.doc.cursor = { nodeId: null, sequenceId: null, index: 0, offset: 0, selected: null, ...action.payload, stepId: step.id };
    },
    next(state) {
      const d = state.doc, c = d.cursor, info = activeInfo(d);
      if (!info) { const s = c.sequenceId && findSequence(stepOf(d).expression, c.sequenceId); const n = s && s.children[c.index]; if (n) focusFirst(d, n); return; }
      const ancestor = info.ancestors.at(-1);
      if (!ancestor) { focusGap(d, info.parent, info.index + 1); return; }
      const parts = fields(ancestor.node); const i = parts.findIndex(([s]) => nodes(s).some(x => x.node.id === info.node.id));
      if (parts[i + 1]) focusFirst(d, parts[i + 1][0]);
      else focusGap(d, ancestor.parent, ancestor.index + 1);
    },
    move(state, action: PayloadAction<-1 | 1>) {
      const d = state.doc, c = d.cursor, dir = action.payload, info = activeInfo(d);
      if (c.selected && info) { focusGap(d, info.parent, info.index + (dir > 0 ? 1 : 0)); return; }
      if (c.sequenceId) {
        const s = findSequence(stepOf(d).expression, c.sequenceId)!; const n = s.children[c.index + (dir < 0 ? -1 : 0)];
        if (n) { const all = leaves(seq([n])); const leaf = (dir < 0 ? all.at(-1)! : all[0]).node; focusNode(d, leaf, dir < 0 && leaf.type === 'number' ? leaf.value.length : 0); }
        return;
      }
      if (!info) return;
      if (info.node.type === 'number' && ((dir < 0 && c.offset > 0) || (dir > 0 && c.offset < info.node.value.length))) { c.offset += dir; return; }
      for (const ancestor of [...info.ancestors].reverse()) {
        const all = leaves(seq([ancestor.node])); if ((dir < 0 ? all[0] : all.at(-1)!).node.id === info.node.id) { focusGap(d, ancestor.parent, ancestor.index + (dir > 0 ? 1 : 0)); return; }
      }
      const all = leaves(stepOf(d).expression); const index = all.findIndex(x => x.node.id === info.node.id); const n = all[index + dir]?.node;
      if (n) focusNode(d, n, dir < 0 && n.type === 'number' ? n.value.length : 0);
    },
    /**
     * Horizontal motion follows the MAIN LINE of the expression. A fraction
     * numerator moves to the next fraction numerator, not to its denominator.
     * Vertical motion is reserved for changing fraction levels.
     */
    horizontal(state, action: PayloadAction<-1 | 1>) {
      const d = state.doc, c = d.cursor, top = stepOf(d).expression, direction = action.payload;
      const info = activeInfo(d);
      let nextIndex: number;
      if (c.sequenceId === top.id) nextIndex = c.index + (direction < 0 ? -1 : 0);
      else if (info) nextIndex = (info.ancestors[0]?.index ?? info.index) + direction;
      else return;
      if (nextIndex < 0 || nextIndex >= top.children.length) {
        focusGap(d, top, direction > 0 ? top.children.length : 0);
        return;
      }
      const next = top.children[nextIndex];
      if (next.type === 'fraction') {
        const previousPath = info?.path ?? '';
        const sequence = previousPath.includes('Denominator') ? next.denominator : next.numerator;
        focusFirst(d, sequence);
      } else {
        const all = leaves(seq([next]));
        const leaf = direction < 0 ? all.at(-1)!.node : all[0].node;
        focusNode(d, leaf, direction < 0 && leaf.type === 'number' ? leaf.value.length : 0);
      }
    },
    vertical(state, action: PayloadAction<-1 | 1>) {
      const d = state.doc, info = activeInfo(d);
      if (!info) return;
      const fraction = [...info.ancestors].reverse().find(a => a.node.type === 'fraction');
      if (!fraction || fraction.node.type !== 'fraction') return;
      const target = action.payload < 0 ? fraction.node.numerator : fraction.node.denominator;
      focusFirst(d, target);
    },
    adjacentExercise(state, action: PayloadAction<-1 | 1>) {
      const d = state.doc, index = d.exercises.findIndex(x => x.id === d.exerciseId);
      const target = d.exercises[index + action.payload];
      if (!target) return;
      d.exerciseId = target.id;
      const line = target.steps.at(-1)!;
      d.cursor.stepId = line.id;
      focusFirst(d, line.expression);
      state.notice = '';
    },
    startDiagnostic(state) {
      const previous = clone(state.doc);
      const exercises: Exercise[] = diagnosticQuestions.map(q => ({
        id: uid(), mode: 'math', source: q.source, prompt: q.stem,
        diagnosticId: q.id, steps: [blankStep()]
      }));
      state.past.push(previous);
      if (state.past.length > 80) state.past.shift();
      state.future = [];
      const first = exercises[0];
      state.doc = {
        exercises, exerciseId: first.id,
        cursor: { stepId: first.steps[0].id, nodeId: leaves(first.steps[0].expression)[0].node.id, sequenceId: null, index: 0, offset: 0, selected: null }
      };
      state.notice = '30-question diagnostic ready. Answers are never shown during the test.';
    },
    selectParent(state) {
      const info = activeInfo(state.doc); if (!info) return;
      const parent = info.ancestors.at(-1)?.node;
      if (parent) { state.doc.cursor.selected = parent.id; state.doc.cursor.nodeId = null; state.doc.cursor.sequenceId = null; }
      else if (fields(info.node).length) state.doc.cursor.selected = info.node.id;
    },
    copyStructure(state) { const info = activeInfo(state.doc); if (state.doc.cursor.selected && info) { state.structureClipboard = clone(info.node); state.notice = 'Structure copied. Choose a position, then Paste.'; } },
    undo(state) { const prev = state.past.pop(); if (prev) { state.future.push(clone(state.doc)); state.doc = prev; state.notice = ''; } },
    redo(state) { const next = state.future.pop(); if (next) { state.past.push(clone(state.doc)); state.doc = next; state.notice = ''; } },
    keyboard(state, action: PayloadAction<boolean>) { state.keyboardOpen = action.payload; },
    compact(state) { state.prefs.compact = !state.prefs.compact; },
    symbols(state) { state.symbolsOpen = !state.symbolsOpen; },
    closeSymbols(state) { state.symbolsOpen = false; },
    topic(state, action: PayloadAction<string>) { state.topic = action.payload; },
    favorite(state, action: PayloadAction<string>) { const k = action.payload; state.prefs.favorites = state.prefs.favorites.includes(k) ? state.prefs.favorites.filter(x => x !== k) : [...state.prefs.favorites, k].slice(0, 12); },
    recentSymbol(state, action: PayloadAction<string>) { state.prefs.recent = [action.payload, ...state.prefs.recent.filter(x => x !== action.payload)].slice(0, 4); },
    copied(state, action: PayloadAction<{ exerciseId: string; snapshot: string }>) { state.copies[action.payload.exerciseId] = action.payload.snapshot; state.notice = 'Copied. Paste into this chat and send.'; },
    notice(state, action: PayloadAction<string>) { state.notice = action.payload; },
    switchExercise(state, action: PayloadAction<string>) { const ex = state.doc.exercises.find(x => x.id === action.payload); if (ex) { state.doc.exerciseId = ex.id; const last = ex.steps.at(-1)!; state.doc.cursor.stepId = last.id; focusFirst(state.doc, last.expression); state.notice = ''; } },
    load(state, action: PayloadAction<{ doc: Document; prefs?: Preferences }>) { state.past = []; state.future = []; state.doc = action.payload.doc; if (action.payload.prefs) state.prefs = action.payload.prefs; state.copies = {}; state.notice = 'Session restored.'; }
  }
});
export const actions = slice.actions;
export const reducer = slice.reducer;
export const makeStore = (preloadedState?: ScratchState) => configureStore({ reducer, preloadedState });
export type ScratchStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<ScratchStore['getState']>;
export type AppDispatch = ScratchStore['dispatch'];
