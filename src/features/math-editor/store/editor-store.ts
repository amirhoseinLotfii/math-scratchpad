import { produce } from 'immer';
import { createStore } from 'zustand/vanilla';
import { persist, type PersistOptions } from 'zustand/middleware';
type PayloadAction<T> = { payload: T };
import { validScale } from '../model/model';
import { blank, blankStep, clone, example, fields, findSequence, freshNode, ident, latex, leaves, makeStructure, MAX_SESSION_EXERCISES, nodes, num, op, seq, stepLatex, uid, type Cursor, type Document, type Exercise, type MathNode, type Preferences, type Sequence, type SessionMeta, isoLocal, elapsedAt } from '../../../model';
import { parse } from '../../../parser';
import { diagnosticQuestions } from '../../../diagnostic';
import { fractionRoundOne } from '../../../fractionRoundOne';

export type ScratchState = {
  doc: Document; past: Document[]; future: Document[];
  prefs: Preferences; keyboardOpen: boolean; symbolsOpen: boolean; topic: string;
  structureClipboard: MathNode | null;
  copies: Record<string, string>; notice: string;
  storageState?: { kind: 'error' | 'conflict'; message: string };
  savedAt?: string;
};
export function exerciseOf(doc: Document) { return doc.exercises.find(x => x.id === doc.exerciseId)!; }
export function stepOf(doc: Document) { return exerciseOf(doc).steps.find(s => s.id === doc.cursor.stepId)!; }
export function initialDocument(): Document {
  const step = blankStep(); step.expression = parse(example);
  const exercise: Exercise = { id: uid(), source: example, mode: 'math', steps: [step] };
  return { session: newSessionMeta(), exercises: [exercise], exerciseId: exercise.id, cursor: { stepId: step.id, nodeId: leaves(step.expression)[0].node.id, sequenceId: null, index: 0, offset: 0, selected: null } };
}
export function newSessionMeta(): SessionMeta { return { id: `S-${isoLocal().slice(0, 16).replace(/[-:T]/g, '')}-${uid().slice(1, 7)}`, startedAt: isoLocal() }; }
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
  | { type: 'insertBlankNumber' | 'deleteForward' | 'backspace' | 'clear' | 'newStep' | 'deleteStep' | 'final' | 'duplicate' | 'cut' | 'paste' | 'deleteStructure' }
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
  } else if (cmd.type === 'insertBlankNumber') {
    put(d, num());
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
  } else if (cmd.type === 'backspace' || cmd.type === 'deleteForward' || cmd.type === 'deleteStructure') {
    const selectWhole = (target: NonNullable<typeof item>) => {
      c.selected = target.node.id; c.nodeId = null; c.sequenceId = null;
    };
    const remove = (parent: Sequence, index: number) => {
      parent.children.splice(index, 1);
      if (!parent.children.length) { parent.children.push(num()); focusFirst(d, parent); }
      else focusGap(d, parent, Math.min(index, parent.children.length));
    };
    if (c.selected && item) remove(item.parent, item.index);
    else if (c.sequenceId) {
      const parent = findSequence(current.expression, c.sequenceId)!;
      const index = c.index - (cmd.type === 'backspace' ? 1 : 0);
      const adjacent = parent.children[index];
      if (adjacent) {
        if (cmd.type === 'backspace' && fields(adjacent).length) {
          c.selected = adjacent.id; c.nodeId = null; c.sequenceId = null;
        } else remove(parent, index);
      }
    } else if (item) {
      if (cmd.type === 'deleteStructure') remove(item.parent, item.index);
      else if (item.node.type === 'number') {
        const n = item.node;
        if (cmd.type === 'backspace' && c.offset > 0) {
          n.value = n.value.slice(0, c.offset - 1) + n.value.slice(c.offset); c.offset--;
        } else if (cmd.type === 'deleteForward' && c.offset < n.value.length) {
          n.value = n.value.slice(0, c.offset) + n.value.slice(c.offset + 1);
        } else {
          const index = item.index + (cmd.type === 'backspace' ? -1 : 1);
          const adjacent = item.parent.children[index];
          if (adjacent) {
            if (fields(adjacent).length) { c.selected = adjacent.id; c.nodeId = null; c.sequenceId = null; }
            else remove(item.parent, index);
          } else if (!n.value && item.ancestors.length) {
            const parent = item.ancestors.at(-1)!;
            // Never silently discard a populated sibling field.
            if (leaves(seq([parent.node])).every(x => x.node.type === 'number' && !x.node.value)) remove(parent.parent, parent.index);
            else selectWhole(parent);
          }
        }
      } else remove(item.parent, item.index);
    }
  } else if (cmd.type === 'clear') { current.expression = blank(); focusFirst(d, current.expression); }
  else if (cmd.type === 'newStep') {
    if (ex.steps.length >= 40) throw Error('Maximum 40 steps per exercise.');
    const step = blankStep(); ex.steps.push(step); c.stepId = step.id; focusFirst(d, step.expression);
  } else if (cmd.type === 'deleteStep') {
    if (ex.steps[0].id === current.id) return;
    else { const index = ex.steps.indexOf(current); ex.steps.splice(index, 1); const next = ex.steps[Math.min(index, ex.steps.length - 1)]; c.stepId = next.id; focusFirst(d, next.expression); }
  } else if (cmd.type === 'final') { const value = !current.final; ex.steps.forEach(s => { s.final = s.id === current.id && value; }); if (value) ex.submittedAt = isoLocal(); }
  else if (cmd.type === 'cut' || cmd.type === 'duplicate') {
    if (!c.selected || !item) return;
    if (cmd.type === 'cut') {
      state.structureClipboard = clone(item.node); item.parent.children.splice(item.index, 1);
      if (!item.parent.children.length) item.parent.children.push(num()); focusGap(d, item.parent, item.index);
    } else { const copy = freshNode(item.node); item.parent.children.splice(item.index + 1, 0, copy); c.selected = copy.id; c.nodeId = null; c.sequenceId = null; }
  } else if (cmd.type === 'paste') { if (state.structureClipboard) put(d, freshNode(state.structureClipboard)); }
  else if (cmd.type === 'newProblem' || cmd.type === 'newExercise') {
    if (d.exercises.length >= MAX_SESSION_EXERCISES) throw Error(`Maximum ${MAX_SESSION_EXERCISES} exercises. Export a backup before starting another session.`);
    const step = blankStep(); const source = cmd.type === 'newProblem' ? stepLatex(current) : cmd.source.trim();
    if (!source || source.length > 4000) throw Error('Enter a problem (at most 4000 characters).');
    const next: Exercise = { id: uid(), source, mode: cmd.type === 'newProblem' ? 'math' : cmd.mode, steps: [step] };
    if (cmd.type === 'newExercise' && cmd.expression) step.expression = clone(cmd.expression);
    d.exercises.push(next); d.exerciseId = next.id; c.stepId = step.id; focusFirst(d, step.expression);
  }
}
function restoreExerciseEdit(doc: Document, snapshot: Document) {
  const old = snapshot.exercises.find(x => x.id === doc.exerciseId);
  const current = exerciseOf(doc);
  if (!old) return;
  current.steps = clone(old.steps);
  doc.cursor = clone(snapshot.cursor);
}
const handlers = {
    /** Persist a lossless math input snapshot alongside the legacy AST. */
    mathInput(state: ScratchState, action: PayloadAction<{ stepId: string; value: string; expression?: Sequence }>) {
      const exercise = exerciseOf(state.doc), index = exercise.steps.findIndex(step => step.id === action.payload.stepId);
      const step = exercise.steps[index];
      if (!step || action.payload.value.length > 4000 || step.mathLatex === action.payload.value) return;
      const before = clone(state.doc);
      step.mathLatex = action.payload.value;
      if (action.payload.expression) step.expression = clone(action.payload.expression);
      else if (/^\s*(?:\\placeholder(?:\[[^\]]*\])?\{\}\s*)*$/.test(action.payload.value)) step.expression = blank();
      step.edited = true;
      if (!exercise.startedAt) exercise.startedAt = isoLocal();
      invalidate(state.doc, index);
      state.past.push(before); if (state.past.length > 80) state.past.shift();
      state.future = state.future.filter(snapshot => snapshot.exerciseId !== exercise.id);
      state.doc.cursor.stepId = step.id;
      state.notice = '';
    },
    command(state: ScratchState, action: PayloadAction<Command>) {
      const before = clone(state.doc), exId = state.doc.exerciseId, index = exerciseOf(state.doc).steps.indexOf(stepOf(state.doc));
      try {
        applyCommand(state, action.payload);
        if (JSON.stringify(before.exercises) === JSON.stringify(state.doc.exercises)) return;
        { const touched = exerciseOf(state.doc); if (!touched.startedAt) touched.startedAt = isoLocal(); }
        state.past.push(before); if (state.past.length > 80) state.past.shift(); state.future = state.future.filter(x => x.exerciseId !== exId);
        if (state.doc.exerciseId === exId) {
          const previousStep = exerciseOf(before).steps[index];
          const changedStep = exerciseOf(state.doc).steps.find(step => step.id === previousStep.id);
          if (changedStep && JSON.stringify(previousStep.expression) !== JSON.stringify(changedStep.expression)) {
            delete changedStep.mathLatex;
            changedStep.edited = true; invalidate(state.doc, index);
          } else if (!changedStep) invalidate(state.doc, index);
        }
        state.notice = '';
      } catch (error) { state.doc = before; state.notice = error instanceof Error ? error.message : 'Could not edit.'; }
    },
    select(state: ScratchState, action: PayloadAction<Partial<Cursor> & { stepId: string }>) {
      const step = exerciseOf(state.doc).steps.find(s => s.id === action.payload.stepId); if (!step) return;
      state.doc.cursor = { nodeId: null, sequenceId: null, index: 0, offset: 0, selected: null, ...action.payload, stepId: step.id };
    },
    next(state: ScratchState) {
      const d = state.doc, c = d.cursor, info = activeInfo(d);
      if (!info) { const s = c.sequenceId && findSequence(stepOf(d).expression, c.sequenceId); const n = s && s.children[c.index]; if (n) focusFirst(d, n); return; }
      const ancestor = info.ancestors.at(-1);
      if (!ancestor) { focusGap(d, info.parent, info.index + 1); return; }
      const parts = fields(ancestor.node); const i = parts.findIndex(([s]) => nodes(s).some(x => x.node.id === info.node.id));
      if (parts[i + 1]) focusFirst(d, parts[i + 1][0]);
      else focusGap(d, ancestor.parent, ancestor.index + 1);
    },
    move(state: ScratchState, action: PayloadAction<-1 | 1>) {
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
    /** Move within digits first, then across siblings; Up/Down changes fraction levels. */
    horizontal(state: ScratchState, action: PayloadAction<-1 | 1>) {
      const d = state.doc, c = d.cursor, direction = action.payload, info = activeInfo(d);
      const enter = (node: MathNode) => {
        const all = leaves(seq([node]));
        const leaf = direction < 0 ? all.at(-1)!.node : all[0].node;
        focusNode(d, leaf, direction < 0 && leaf.type === 'number' ? leaf.value.length : 0);
      };
      if (c.selected && info) { focusGap(d, info.parent, info.index + (direction > 0 ? 1 : 0)); return; }
      if (c.sequenceId) {
        const parent = findSequence(stepOf(d).expression, c.sequenceId);
        const target = parent?.children[c.index + (direction < 0 ? -1 : 0)];
        if (target) enter(target);
        return;
      }
      if (!info) return;
      if (info.node.type === 'number') {
        const offset = c.offset + direction;
        if (offset >= 0 && offset <= info.node.value.length) { c.offset = offset; return; }
      }
      const sibling = info.parent.children[info.index + direction];
      if (sibling) { enter(sibling); return; }
      // Leave an exhausted field at its structural boundary, never jump mid-number.
      for (const parent of [...info.ancestors].reverse()) {
        const target = parent.parent.children[parent.index + direction];
        if (target) { enter(target); return; }
      }
      const top = stepOf(d).expression;
      focusGap(d, top, direction > 0 ? top.children.length : 0);
    },
    vertical(state: ScratchState, action: PayloadAction<-1 | 1>) {
      const d = state.doc, info = activeInfo(d);
      if (!info) return;
      const fraction = [...info.ancestors].reverse().find(a => a.node.type === 'fraction');
      if (!fraction || fraction.node.type !== 'fraction') return;
      const target = action.payload < 0 ? fraction.node.numerator : fraction.node.denominator;
      const leaf = leaves(target)[0].node;
      focusNode(d, leaf, leaf.type === 'number' ? Math.min(d.cursor.offset, leaf.value.length) : 0);
    },
    adjacentExercise(state: ScratchState, action: PayloadAction<-1 | 1>) {
      const d = state.doc, index = d.exercises.findIndex(x => x.id === d.exerciseId);
      const target = d.exercises[index + action.payload];
      if (!target) return;
      d.exerciseId = target.id;
      const line = target.steps.at(-1)!;
      d.cursor.stepId = line.id;
      focusFirst(d, line.expression);
      state.notice = '';
    },
    setConfidence(state: ScratchState, action: PayloadAction<'high' | 'medium' | 'low'>) {
      const ex = exerciseOf(state.doc); ex.confidence = action.payload; ex.submittedAt = isoLocal();
    },
    setHint(state: ScratchState, action: PayloadAction<{ used: boolean; note?: string }>) {
      const ex = exerciseOf(state.doc); ex.hintUsed = action.payload.used;
      const note = action.payload.note?.slice(0, 500); if (note) ex.hintNote = note; else delete ex.hintNote;
    },
    openGuidance(state: ScratchState) {
      const ex = exerciseOf(state.doc); if (!ex.guidance) return;
      if (!ex.guidanceOpenedAt) ex.guidanceOpenedAt = isoLocal();
    },
    /** Before leaving a question with confirmed confidence: mark the last non-empty step Final when nothing is Final. */
    autoFinal(state: ScratchState) {
      const ex = exerciseOf(state.doc);
      if (ex.skipped || ex.steps.some(s => s.final)) return;
      const lastWork = [...ex.steps].reverse().find(s => stepLatex(s) !== '\\square');
      if (lastWork) lastWork.final = true;
    },
    setSessionMeta(state: ScratchState, action: PayloadAction<Partial<Omit<SessionMeta, 'id' | 'startedAt'>>>) {
      const meta = state.doc.session ?? (state.doc.session = newSessionMeta());
      const { anxiety, energy, ...rest } = action.payload; Object.assign(meta, rest);
      for (const [k, v] of [['anxiety', anxiety], ['energy', energy]] as const) { if (!(k in action.payload)) continue; const ok = validScale(v); if (ok) meta[k] = ok; else delete meta[k]; }
    },
    resetSession(state: ScratchState) {
      state.doc = initialDocument(); state.past = []; state.future = []; state.copies = {}; state.notice = 'Session reset. A new session has started.';
    },
    setSkipped(state: ScratchState, action: PayloadAction<boolean>) {
      exerciseOf(state.doc).skipped = action.payload;
    },
    startDiagnostic(state: ScratchState) {
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
        session: newSessionMeta(), exercises, exerciseId: first.id,
        cursor: { stepId: first.steps[0].id, nodeId: leaves(first.steps[0].expression)[0].node.id, sequenceId: null, index: 0, offset: 0, selected: null }
      };
      state.notice = '30-question diagnostic ready. Answers are never shown during the test.';
    },
    startFractionRound(state: ScratchState) {
      const previous = clone(state.doc);
      const exercises: Exercise[] = fractionRoundOne.map(q => ({
        id: uid(), mode: q.source ? 'math' : 'text', source: q.source || ' ', prompt: q.stem, assessment: 'fractions-round-1',
        diagnosticId: q.id, steps: [blankStep()]
      }));
      state.past.push(previous);
      if (state.past.length > 80) state.past.shift();
      state.future = [];
      const first = exercises[0];
      state.doc = {
        session: newSessionMeta(), exercises, exerciseId: first.id,
        cursor: { stepId: first.steps[0].id, nodeId: leaves(first.steps[0].expression)[0].node.id, sequenceId: null, index: 0, offset: 0, selected: null }
      };
      state.notice = 'Round 1: 20 fraction questions ready. Answers are never shown during the test.';
    },
    selectParent(state: ScratchState) {
      const info = activeInfo(state.doc); if (!info) return;
      const parent = info.ancestors.at(-1)?.node;
      if (parent) { state.doc.cursor.selected = parent.id; state.doc.cursor.nodeId = null; state.doc.cursor.sequenceId = null; }
      else if (fields(info.node).length) state.doc.cursor.selected = info.node.id;
    },
    copyStructure(state: ScratchState) { const info = activeInfo(state.doc); if (state.doc.cursor.selected && info) { state.structureClipboard = clone(info.node); state.notice = 'Structure copied. Choose a position, then Paste.'; } },
    undo(state: ScratchState) {
      const index = state.past.map(doc => doc.exerciseId).lastIndexOf(state.doc.exerciseId);
      if (index < 0) return;
      const [previous] = state.past.splice(index, 1);
      state.future.push(clone(state.doc)); restoreExerciseEdit(state.doc, previous); state.notice = '';
    },
    redo(state: ScratchState) {
      const index = state.future.map(doc => doc.exerciseId).lastIndexOf(state.doc.exerciseId);
      if (index < 0) return;
      const [next] = state.future.splice(index, 1);
      state.past.push(clone(state.doc)); restoreExerciseEdit(state.doc, next); state.notice = '';
    },
    /** Opens a timing segment for the shown question and closes any other question's open segment. */
    timerStart(state: ScratchState, action: PayloadAction<{ exerciseId: string; now: number }>) {
      const { exerciseId, now } = action.payload; if (!Number.isFinite(now)) return;
      for (const ex of state.doc.exercises) {
        if (ex.id === exerciseId) { if (!ex.timerPaused && !Number.isFinite(ex.timerRunningSince)) ex.timerRunningSince = now; }
        else if (Number.isFinite(ex.timerRunningSince)) { ex.elapsedMs = elapsedAt(ex, now); delete ex.timerRunningSince; }
      }
    },
    timerPause(state: ScratchState, action: PayloadAction<{ exerciseId: string; now: number; paused: boolean }>) {
      const ex = state.doc.exercises.find(x => x.id === action.payload.exerciseId); if (!ex) return;
      if (action.payload.paused) { if (Number.isFinite(ex.timerRunningSince)) ex.elapsedMs = elapsedAt({ ...ex, timerPaused: false }, action.payload.now); delete ex.timerRunningSince; ex.timerPaused = true; }
      else { delete ex.timerPaused; ex.timerRunningSince = action.payload.now; }
    },
    addQuestionTime(state: ScratchState, action: PayloadAction<{ exerciseId: string; milliseconds: number }>) {
      const ex = state.doc.exercises.find(x => x.id === action.payload.exerciseId);
      if (ex && Number.isFinite(action.payload.milliseconds) && action.payload.milliseconds >= 0)
        ex.elapsedMs = (ex.elapsedMs ?? 0) + action.payload.milliseconds;
    },
    keyboard(state: ScratchState, action: PayloadAction<boolean>) { state.keyboardOpen = action.payload; },
    compact(state: ScratchState) { state.prefs.compact = !state.prefs.compact; },
    symbols(state: ScratchState) { state.symbolsOpen = !state.symbolsOpen; },
    closeSymbols(state: ScratchState) { state.symbolsOpen = false; },
    topic(state: ScratchState, action: PayloadAction<string>) { state.topic = action.payload; },
    favorite(state: ScratchState, action: PayloadAction<string>) { const k = action.payload; state.prefs.favorites = state.prefs.favorites.includes(k) ? state.prefs.favorites.filter(x => x !== k) : [...state.prefs.favorites, k].slice(0, 12); },
    recentSymbol(state: ScratchState, action: PayloadAction<string>) { state.prefs.recent = [action.payload, ...state.prefs.recent.filter(x => x !== action.payload)].slice(0, 4); },
    copied(state: ScratchState, action: PayloadAction<{ exerciseId: string; snapshot: string }>) { state.copies[action.payload.exerciseId] = action.payload.snapshot; state.notice = 'Copied. Paste into this chat and send.'; },
    notice(state: ScratchState, action: PayloadAction<string>) { state.notice = action.payload; },
    switchExercise(state: ScratchState, action: PayloadAction<string>) { const ex = state.doc.exercises.find(x => x.id === action.payload); if (ex) { state.doc.exerciseId = ex.id; const last = ex.steps.at(-1)!; state.doc.cursor.stepId = last.id; focusFirst(state.doc, last.expression); state.notice = ''; } },
    load(state: ScratchState, action: PayloadAction<{ doc: Document; prefs?: Preferences }>) { state.past = []; state.future = []; state.doc = action.payload.doc; if (action.payload.prefs) state.prefs = action.payload.prefs; state.copies = {}; state.notice = 'Session restored.'; }
};
type HandlerName = keyof typeof handlers;
type PayloadOf<F> = F extends (state: ScratchState, action: infer A) => void ? A extends { payload: infer P } ? P : never : never;
type Creators = { [K in HandlerName]: [PayloadOf<(typeof handlers)[K]>] extends [never] ? () => { type: K } : (payload: PayloadOf<(typeof handlers)[K]>) => { type: K; payload: PayloadOf<(typeof handlers)[K]> } };
export type EditorAction = { type: HandlerName; payload?: unknown };
export const actions = Object.fromEntries(Object.keys(handlers).map(type => [type, (payload?: unknown) => ({ type, payload })])) as unknown as Creators;
export function reducer(state: ScratchState = initialState(), action: EditorAction): ScratchState {
  const handler = handlers[action.type] as ((draft: ScratchState, action: EditorAction) => void) | undefined;
  return handler ? produce(state, draft => handler(draft, action)) : state;
}
export type PersistedSession = { session: { doc: Document; prefs: Preferences; keyboardOpen: boolean }; sync: { revision: number; writerId: string } };
export const makeStore = (preloadedState?: ScratchState, persistence?: PersistOptions<ScratchState, PersistedSession>) => {
  const start = () => preloadedState ?? initialState();
  const store = persistence ? createStore<ScratchState>()(persist(start, persistence)) : createStore<ScratchState>()(start);
  return Object.assign(store, {
    dispatch: (action: EditorAction) => { store.setState(reducer(store.getState(), action), true); return action; },
    resolveConflict: undefined as ((choice: 'local' | 'remote') => void) | undefined,
    clearStorage: undefined as (() => void) | undefined,
  });
};
export type ScratchStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<ScratchStore['getState']>;
export type AppDispatch = ScratchStore['dispatch'];
