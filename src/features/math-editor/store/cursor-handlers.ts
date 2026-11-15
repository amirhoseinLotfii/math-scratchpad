import { clone, fields, findSequence, leaves, nodes, seq, type Cursor, type MathNode } from '../../../model';

import { activeInfo, exerciseOf, stepOf, type ScratchState, type PayloadAction } from './editor-state';
import { focusFirst, focusGap, focusNode } from './editor-cursor';
export const cursorHandlers = {
  select(state: ScratchState, action: PayloadAction<Partial<Cursor> & { stepId: string }>) {
    const step = exerciseOf(state.doc).steps.find((s) => s.id === action.payload.stepId);
    if (!step) return;
    state.doc.cursor = { nodeId: null, sequenceId: null, index: 0, offset: 0, selected: null, ...action.payload, stepId: step.id };
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
    const i = parts.findIndex(([s]) => nodes(s).some((x) => x.node.id === info.node.id));
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
    if (info.node.type === 'number' && ((dir < 0 && c.offset > 0) || (dir > 0 && c.offset < info.node.value.length))) {
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
    const index = all.findIndex((x) => x.node.id === info.node.id);
    const n = all[index + dir]?.node;
    if (n) focusNode(d, n, dir < 0 && n.type === 'number' ? n.value.length : 0);
  },
  /** Move within digits first, then across siblings; Up/Down changes fraction levels. */
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
    // Leave an exhausted field at its structural boundary, never jump mid-number.
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
    const fraction = [...info.ancestors].reverse().find((a) => a.node.type === 'fraction');
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
