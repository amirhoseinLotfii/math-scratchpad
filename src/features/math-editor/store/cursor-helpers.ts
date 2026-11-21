import {
  clone,
  fields,
  findSequence,
  leaves,
  nodes,
  seq,
  type Cursor,
  type Document,
  type Exercise,
  type MathNode,
  type Sequence,
} from '../model/model';
import { exerciseOf, stepOf, type PayloadAction, type ScratchState } from './types';

export function focusNode(doc: Document, node: MathNode, offset = 0) {
  doc.cursor.nodeId = node.id;
  doc.cursor.sequenceId = null;
  doc.cursor.offset = offset;
  doc.cursor.selected = null;
}

export function focusGap(doc: Document, sequence: Sequence, index: number) {
  doc.cursor.nodeId = null;
  doc.cursor.sequenceId = sequence.id;
  doc.cursor.index = index;
  doc.cursor.offset = 0;
  doc.cursor.selected = null;
}

export function focusFirst(doc: Document, structure: MathNode | Sequence) {
  const leaf = leaves(structure.type === 'sequence' ? structure : seq([structure]))[0].node;
  focusNode(doc, leaf);
}

export function activeInfo(doc: Document) {
  return nodes(stepOf(doc).expression).find(
    x => x.node.id === (doc.cursor.selected ?? doc.cursor.nodeId)
  );
}

export function insertion(doc: Document): { parent: Sequence; index: number; replace: boolean } {
  const c = doc.cursor;
  if (c.sequenceId) {
    const parent = findSequence(stepOf(doc).expression, c.sequenceId)!;
    const target = parent.children[c.index];
    return {
      parent,
      index: c.index,
      replace: target?.type === 'number' && target.value === '',
    };
  }
  const item = activeInfo(doc)!;
  return {
    parent: item.parent,
    index: item.index + (item.node.type === 'number' && !item.node.value ? 0 : 1),
    replace: item.node.type === 'number' && !item.node.value,
  };
}

export function put(doc: Document, node: MathNode) {
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

export function invalidateSubmission(exercise: Exercise) {
  delete exercise.confidence;
  delete exercise.submittedAt;
}

export function invalidate(doc: Document, from: number) {
  const exercise = exerciseOf(doc);
  invalidateSubmission(exercise);
  exercise.steps.forEach((step, index) => {
    if (index >= from) step.status = index === from ? 'unchecked' : 'needs-review';
  });
}

export function restoreExerciseEdit(doc: Document, snapshot: Document) {
  const old = snapshot.exercises.find(x => x.id === doc.exerciseId);
  const current = exerciseOf(doc);
  if (!old) return;
  current.steps = clone(old.steps);
  doc.cursor = clone(snapshot.cursor);
}

export const cursorHandlers = {
  select(state: ScratchState, action: PayloadAction<Partial<Cursor> & { stepId: string }>) {
    const step = exerciseOf(state.doc).steps.find(s => s.id === action.payload.stepId);
    if (!step) return;
    state.doc.cursor = {
      nodeId: null,
      sequenceId: null,
      index: 0,
      offset: 0,
      selected: null,
      ...action.payload,
      stepId: step.id,
    };
  },
  next(state: ScratchState) {
    const d = state.doc,
      c = d.cursor,
      info = activeInfo(d);
    if (!info) {
      const s = c.sequenceId && findSequence(stepOf(d).expression, c.sequenceId);
      const n = s && s.children[c.index];
      if (n) focusFirst(d, n);
      return;
    }
    const ancestor = info.ancestors.at(-1);
    if (!ancestor) {
      focusGap(d, info.parent, info.index + 1);
      return;
    }
    const parts = fields(ancestor.node);
    const i = parts.findIndex(([s]) => nodes(s).some(x => x.node.id === info.node.id));
    if (parts[i + 1]) focusFirst(d, parts[i + 1][0]);
    else focusGap(d, ancestor.parent, ancestor.index + 1);
  },
  move(state: ScratchState, action: PayloadAction<-1 | 1>) {
    const d = state.doc,
      c = d.cursor,
      dir = action.payload,
      info = activeInfo(d);
    if (c.selected && info) {
      focusGap(d, info.parent, info.index + (dir > 0 ? 1 : 0));
      return;
    }
    if (c.sequenceId) {
      const s = findSequence(stepOf(d).expression, c.sequenceId)!;
      const n = s.children[c.index + (dir < 0 ? -1 : 0)];
      if (n) {
        const all = leaves(seq([n]));
        const leaf = (dir < 0 ? all.at(-1)! : all[0]).node;
        focusNode(d, leaf, dir < 0 && leaf.type === 'number' ? leaf.value.length : 0);
      }
      return;
    }
    if (!info) return;
    if (
      info.node.type === 'number' &&
      ((dir < 0 && c.offset > 0) || (dir > 0 && c.offset < info.node.value.length))
    ) {
      c.offset += dir;
      return;
    }
    for (const ancestor of [...info.ancestors].reverse()) {
      const all = leaves(seq([ancestor.node]));
      if ((dir < 0 ? all[0] : all.at(-1)!).node.id === info.node.id) {
        focusGap(d, ancestor.parent, ancestor.index + (dir > 0 ? 1 : 0));
        return;
      }
    }
    const all = leaves(stepOf(d).expression);
    const index = all.findIndex(x => x.node.id === info.node.id);
    const n = all[index + dir]?.node;
    if (n) focusNode(d, n, dir < 0 && n.type === 'number' ? n.value.length : 0);
  },
  horizontal(state: ScratchState, action: PayloadAction<-1 | 1>) {
    const d = state.doc,
      c = d.cursor,
      direction = action.payload,
      info = activeInfo(d);
    const enter = (node: MathNode) => {
      const all = leaves(seq([node]));
      const leaf = direction < 0 ? all.at(-1)!.node : all[0].node;
      focusNode(d, leaf, direction < 0 && leaf.type === 'number' ? leaf.value.length : 0);
    };
    if (c.selected && info) {
      focusGap(d, info.parent, info.index + (direction > 0 ? 1 : 0));
      return;
    }
    if (c.sequenceId) {
      const parent = findSequence(stepOf(d).expression, c.sequenceId);
      const target = parent?.children[c.index + (direction < 0 ? -1 : 0)];
      if (target) enter(target);
      return;
    }
    if (!info) return;
    if (info.node.type === 'number') {
      const offset = c.offset + direction;
      if (offset >= 0 && offset <= info.node.value.length) {
        c.offset = offset;
        return;
      }
    }
    const sibling = info.parent.children[info.index + direction];
    if (sibling) {
      enter(sibling);
      return;
    }
    for (const parent of [...info.ancestors].reverse()) {
      const target = parent.parent.children[parent.index + direction];
      if (target) {
        enter(target);
        return;
      }
    }
    const top = stepOf(d).expression;
    focusGap(d, top, direction > 0 ? top.children.length : 0);
  },
  vertical(state: ScratchState, action: PayloadAction<-1 | 1>) {
    const d = state.doc,
      info = activeInfo(d);
    if (!info) return;
    const fraction = [...info.ancestors].reverse().find(a => a.node.type === 'fraction');
    if (!fraction || fraction.node.type !== 'fraction') return;
    const target = action.payload < 0 ? fraction.node.numerator : fraction.node.denominator;
    const leaf = leaves(target)[0].node;
    focusNode(d, leaf, leaf.type === 'number' ? Math.min(d.cursor.offset, leaf.value.length) : 0);
  },
  selectParent(state: ScratchState) {
    const info = activeInfo(state.doc);
    if (!info) return;
    const parent = info.ancestors.at(-1)?.node;
    if (parent) {
      state.doc.cursor.selected = parent.id;
      state.doc.cursor.nodeId = null;
      state.doc.cursor.sequenceId = null;
    } else if (fields(info.node).length) state.doc.cursor.selected = info.node.id;
  },
  copyStructure(state: ScratchState) {
    const info = activeInfo(state.doc);
    if (state.doc.cursor.selected && info) {
      state.structureClipboard = clone(info.node);
      state.notice = 'Structure copied. Choose a position, then Paste.';
    }
  },
};
