import {
  blank,
  blankStep,
  clone,
  fields,
  findSequence,
  freshNode,
  ident,
  leaves,
  makeStructure,
  MAX_SESSION_EXERCISES,
  num,
  op,
  seq,
  stepLatex,
  uid,
  type Document,
  type Exercise,
  type MathNode,
  type Sequence,
  isoLocal,
} from '../../../model';
import { activeInfo, exerciseOf, stepOf, type ScratchState } from './editor-state';
import { focusFirst, focusGap, focusNode } from './editor-cursor';
function insertion(doc: Document): { parent: Sequence; index: number; replace: boolean } {
  const c = doc.cursor;
  if (c.sequenceId) {
    const parent = findSequence(stepOf(doc).expression, c.sequenceId)!;
    const target = parent.children[c.index];
    return { parent, index: c.index, replace: target?.type === 'number' && target.value === '' };
  }
  const item = activeInfo(doc)!;
  return {
    parent: item.parent,
    index: item.index + (item.node.type === 'number' && !item.node.value ? 0 : 1),
    replace: item.node.type === 'number' && !item.node.value,
  };
}
function put(doc: Document, node: MathNode) {
  if (doc.cursor.selected) {
    const item = activeInfo(doc)!;
    item.parent.children.splice(item.index, 1, node);
    focusFirst(doc, node);
    return;
  }
  const { parent, index, replace } = insertion(doc);
  parent.children.splice(index, replace ? 1 : 0, node);
  focusFirst(doc, node);
}
export type Command =
  | { type: 'digit' | 'operator' | 'identifier' | 'insert'; value: string }
  | {
      type:
        | 'insertBlankNumber'
        | 'deleteForward'
        | 'backspace'
        | 'clear'
        | 'newStep'
        | 'deleteStep'
        | 'final'
        | 'duplicate'
        | 'cut'
        | 'paste'
        | 'deleteStructure';
    }
  | { type: 'newProblem' }
  | { type: 'newExercise'; source: string; mode: 'math' | 'text'; expression?: Sequence };
export function applyCommand(state: ScratchState, cmd: Command) {
  const d = state.doc,
    ex = exerciseOf(d),
    current = stepOf(d),
    c = d.cursor;
  const item = activeInfo(d);
  if (cmd.type === 'digit') {
    if (!/^[0-9.]$/.test(cmd.value)) return;
    if (item?.node.type === 'number' && !c.selected && !c.sequenceId) {
      const n = item.node;
      if (n.value.length >= 60 || (cmd.value === '.' && n.value.includes('.'))) return;
      n.value = n.value.slice(0, c.offset) + cmd.value + n.value.slice(c.offset);
      c.offset++;
    } else {
      const n = num(cmd.value);
      put(d, n);
      c.offset = 1;
    }
  } else if (cmd.type === 'operator') {
    if (!['+', '−', '×', '÷', '=', '<', '>', '≤', '≥', '≠', '±', '∓'].includes(cmd.value)) return;
    if (item?.node.type === 'operator' && !c.selected && !c.sequenceId) item.node.value = cmd.value;
    else {
      const position = insertion(d);
      const n = op(cmd.value);
      position.parent.children.splice(position.index, position.replace ? 1 : 0, n);
      const next = position.parent.children[position.index + 1];
      if (next && next.type !== 'operator') focusFirst(d, next);
      else {
        const value = num();
        position.parent.children.splice(position.index + 1, 0, value);
        focusNode(d, value);
      }
    }
  } else if (cmd.type === 'insertBlankNumber') {
    put(d, num());
  } else if (cmd.type === 'identifier') {
    if (!/^[a-zA-Zπθ∞σ]$/.test(cmd.value)) return;
    if (item?.node.type === 'identifier' && !c.selected) item.node.value = cmd.value;
    else put(d, ident(cmd.value));
  } else if (cmd.type === 'insert') {
    if (['+', '−', '×', '÷', '=', '<', '>', '≤', '≥', '≠', '±', '∓'].includes(cmd.value)) {
      applyCommand(state, { type: 'operator', value: cmd.value });
      return;
    }
    const structure = makeStructure(cmd.value);
    // Wrapping an explicitly selected structure is intentional; a main-line gap creates an empty template.
    const wrap = c.selected
      ? item
      : item?.node.type !== 'operator' &&
          !c.sequenceId &&
          [
            'fraction',
            'power',
            'root',
            'group',
            'percent',
            'factorial',
            'abs',
            'mean',
            'f',
            'sin',
            'cos',
            'tan',
            'ln',
            'log',
            'exp',
            'det',
            'probability',
          ].includes(cmd.value)
        ? item
        : undefined;
    if (wrap) {
      fields(structure)[0][0].children = [wrap.node];
      wrap.parent.children.splice(wrap.index, 1, structure);
      const empty = leaves(seq([structure])).find((x) => x.node.type === 'number' && !x.node.value);
      focusNode(d, empty?.node ?? leaves(seq([structure]))[0].node);
    } else put(d, structure);
    state.prefs.recent = [cmd.value, ...state.prefs.recent.filter((k) => k !== cmd.value)].slice(0, 4);
    state.symbolsOpen = false;
  } else if (cmd.type === 'backspace' || cmd.type === 'deleteForward' || cmd.type === 'deleteStructure') {
    const selectWhole = (target: NonNullable<typeof item>) => {
      c.selected = target.node.id;
      c.nodeId = null;
      c.sequenceId = null;
    };
    const remove = (parent: Sequence, index: number) => {
      parent.children.splice(index, 1);
      if (!parent.children.length) {
        parent.children.push(num());
        focusFirst(d, parent);
      } else focusGap(d, parent, Math.min(index, parent.children.length));
    };
    if (c.selected && item) remove(item.parent, item.index);
    else if (c.sequenceId) {
      const parent = findSequence(current.expression, c.sequenceId)!;
      const index = c.index - (cmd.type === 'backspace' ? 1 : 0);
      const adjacent = parent.children[index];
      if (adjacent) {
        if (cmd.type === 'backspace' && fields(adjacent).length) {
          c.selected = adjacent.id;
          c.nodeId = null;
          c.sequenceId = null;
        } else remove(parent, index);
      }
    } else if (item) {
      if (cmd.type === 'deleteStructure') remove(item.parent, item.index);
      else if (item.node.type === 'number') {
        const n = item.node;
        if (cmd.type === 'backspace' && c.offset > 0) {
          n.value = n.value.slice(0, c.offset - 1) + n.value.slice(c.offset);
          c.offset--;
        } else if (cmd.type === 'deleteForward' && c.offset < n.value.length) {
          n.value = n.value.slice(0, c.offset) + n.value.slice(c.offset + 1);
        } else {
          const index = item.index + (cmd.type === 'backspace' ? -1 : 1);
          const adjacent = item.parent.children[index];
          if (adjacent) {
            if (fields(adjacent).length) {
              c.selected = adjacent.id;
              c.nodeId = null;
              c.sequenceId = null;
            } else remove(item.parent, index);
          } else if (!n.value && item.ancestors.length) {
            const parent = item.ancestors.at(-1)!;
            // Never silently discard a populated sibling field.
            if (leaves(seq([parent.node])).every((x) => x.node.type === 'number' && !x.node.value)) remove(parent.parent, parent.index);
            else selectWhole(parent);
          }
        }
      } else remove(item.parent, item.index);
    }
  } else if (cmd.type === 'clear') {
    current.expression = blank();
    focusFirst(d, current.expression);
  } else if (cmd.type === 'newStep') {
    if (ex.steps.length >= 40) throw Error('Maximum 40 steps per exercise.');
    const step = blankStep();
    ex.steps.push(step);
    c.stepId = step.id;
    focusFirst(d, step.expression);
  } else if (cmd.type === 'deleteStep') {
    if (ex.steps[0].id === current.id) return;
    else {
      const index = ex.steps.indexOf(current),
        removedFinal = current.final;
      ex.steps.splice(index, 1);
      const next = ex.steps[Math.min(index, ex.steps.length - 1)];
      if (removedFinal)
        ex.steps.forEach((step) => {
          step.final = step.id === next.id;
        });
      c.stepId = next.id;
      focusFirst(d, next.expression);
    }
  } else if (cmd.type === 'final') {
    const value = !current.final;
    ex.steps.forEach((s) => {
      s.final = s.id === current.id && value;
    });
    if (value) ex.submittedAt = isoLocal();
  } else if (cmd.type === 'cut' || cmd.type === 'duplicate') {
    if (!c.selected || !item) return;
    if (cmd.type === 'cut') {
      state.structureClipboard = clone(item.node);
      item.parent.children.splice(item.index, 1);
      if (!item.parent.children.length) item.parent.children.push(num());
      focusGap(d, item.parent, item.index);
    } else {
      const copy = freshNode(item.node);
      item.parent.children.splice(item.index + 1, 0, copy);
      c.selected = copy.id;
      c.nodeId = null;
      c.sequenceId = null;
    }
  } else if (cmd.type === 'paste') {
    if (state.structureClipboard) put(d, freshNode(state.structureClipboard));
  } else if (cmd.type === 'newProblem' || cmd.type === 'newExercise') {
    if (d.exercises.length >= MAX_SESSION_EXERCISES)
      throw Error(`Maximum ${MAX_SESSION_EXERCISES} exercises. Export a backup before starting another session.`);
    const step = blankStep();
    const source = cmd.type === 'newProblem' ? stepLatex(current) : cmd.source.trim();
    if (!source || source.length > 4000) throw Error('Enter a problem (at most 4000 characters).');
    const next: Exercise = { id: uid(), source, mode: cmd.type === 'newProblem' ? 'math' : cmd.mode, steps: [step] };
    if (cmd.type === 'newExercise' && cmd.expression) step.expression = clone(cmd.expression);
    d.exercises.push(next);
    d.exerciseId = next.id;
    c.stepId = step.id;
    focusFirst(d, step.expression);
  }
}
