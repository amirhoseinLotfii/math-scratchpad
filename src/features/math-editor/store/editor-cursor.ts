import { leaves, seq, type Document, type MathNode, type Sequence } from '../../../model';
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
