import {
  blank,
  clone,
  fields,
  findSequence,
  freshNode,
  ident,
  leaves,
  makeStructure,
  num,
  op,
  seq,
  type Sequence,
} from '../model/model';
import { activeInfo, focusFirst, focusGap, focusNode, insertion, put } from './cursor-helpers';
import { applyStepLifecycleCommand } from './step-lifecycle-commands';
import { stepOf, type Command, type ScratchState } from './types';

const OPERATORS = ['+', '−', '×', '÷', '=', '<', '>', '≤', '≥', '≠', '±', '∓'];
const WRAPPABLE = [
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
];

export function applyCommand(state: ScratchState, cmd: Command) {
  if (applyStepLifecycleCommand(state, cmd)) return;
  const d = state.doc,
    current = stepOf(d),
    c = d.cursor,
    item = activeInfo(d);
  if (cmd.type === 'digit') {
    if (!/^[0-9.]$/.test(cmd.value)) return;
    if (item?.node.type === 'number' && !c.selected && !c.sequenceId) {
      const n = item.node;
      if (n.value.length >= 60 || (cmd.value === '.' && n.value.includes('.'))) return;
      n.value = n.value.slice(0, c.offset) + cmd.value + n.value.slice(c.offset);
      c.offset++;
    } else {
      put(d, num(cmd.value));
      c.offset = 1;
    }
  } else if (cmd.type === 'operator') {
    if (!OPERATORS.includes(cmd.value)) return;
    if (item?.node.type === 'operator' && !c.selected && !c.sequenceId) item.node.value = cmd.value;
    else {
      const position = insertion(d);
      position.parent.children.splice(position.index, position.replace ? 1 : 0, op(cmd.value));
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
    if (OPERATORS.includes(cmd.value)) {
      applyCommand(state, { type: 'operator', value: cmd.value });
      return;
    }
    const structure = makeStructure(cmd.value);
    const wrap = c.selected
      ? item
      : item?.node.type !== 'operator' && !c.sequenceId && WRAPPABLE.includes(cmd.value)
        ? item
        : undefined;
    if (wrap) {
      fields(structure)[0][0].children = [wrap.node];
      wrap.parent.children.splice(wrap.index, 1, structure);
      const empty = leaves(seq([structure])).find(x => x.node.type === 'number' && !x.node.value);
      focusNode(d, empty?.node ?? leaves(seq([structure]))[0].node);
    } else put(d, structure);
    state.prefs.recent = [cmd.value, ...state.prefs.recent.filter(k => k !== cmd.value)].slice(0, 4);
    state.symbolsOpen = false;
  } else if (
    cmd.type === 'backspace' ||
    cmd.type === 'deleteForward' ||
    cmd.type === 'deleteStructure'
  ) {
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
            if (leaves(seq([parent.node])).every(x => x.node.type === 'number' && !x.node.value))
              remove(parent.parent, parent.index);
            else selectWhole(parent);
          }
        }
      } else remove(item.parent, item.index);
    }
  } else if (cmd.type === 'clear') {
    current.expression = blank();
    focusFirst(d, current.expression);
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
  } else if (cmd.type === 'paste' && state.structureClipboard) {
    put(d, freshNode(state.structureClipboard));
  }
}
