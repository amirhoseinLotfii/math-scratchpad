import {
  blankStep,
  example,
  leaves,
  nodes,
  uid,
  type Document,
  type Exercise,
  type MathNode,
  type Preferences,
  type SessionMeta,
  isoLocal,
} from '../../../model';
import { parse } from '../../../parser';
export type PayloadAction<T> = { payload: T };
export type ScratchState = {
  doc: Document;
  past: Document[];
  future: Document[];
  prefs: Preferences;
  keyboardOpen: boolean;
  symbolsOpen: boolean;
  topic: string;
  structureClipboard: MathNode | null;
  copies: Record<string, string>;
  notice: string;
  storageState?: { kind: 'error' | 'conflict'; message: string };
  savedAt?: string;
};
export function exerciseOf(doc: Document) {
  return doc.exercises.find((x) => x.id === doc.exerciseId)!;
}
export function stepOf(doc: Document) {
  return exerciseOf(doc).steps.find((s) => s.id === doc.cursor.stepId)!;
}
export function initialDocument(): Document {
  const step = blankStep();
  step.expression = parse(example);
  const exercise: Exercise = { id: uid(), source: example, mode: 'math', steps: [step] };
  return {
    session: newSessionMeta(),
    exercises: [exercise],
    exerciseId: exercise.id,
    cursor: { stepId: step.id, nodeId: leaves(step.expression)[0].node.id, sequenceId: null, index: 0, offset: 0, selected: null },
  };
}
export function newSessionMeta(): SessionMeta {
  return { id: `S-${isoLocal().slice(0, 16).replace(/[-:T]/g, '')}-${uid().slice(1, 7)}`, startedAt: isoLocal() };
}
export function initialState(): ScratchState {
  return {
    doc: initialDocument(),
    past: [],
    future: [],
    prefs: { compact: true, favorites: ['fraction', 'power', 'root'], recent: [] },
    keyboardOpen: false,
    symbolsOpen: false,
    topic: 'Numbers',
    structureClipboard: null,
    copies: {},
    notice: '',
  };
}
export function activeInfo(doc: Document) {
  return nodes(stepOf(doc).expression).find((x) => x.node.id === (doc.cursor.selected ?? doc.cursor.nodeId));
}
