import { metadataSchema } from './features/session/schemas/session-schema';
import {
  ascii, fields, leaves, MAX_SESSION_EXERCISES, templateCounts,
  type Cursor, type Document, type Exercise, type MathNode, type Preferences, type Sequence, type SessionMeta, type Step,
} from './model';
import { initialState, type ScratchState } from './store';
import { getLearningStorage } from './sync/browser-db';

const KEY = 'math-scratchpad-redux-v2';
const EMPTY: Record<string, unknown> = {};
const operators = ['+', '−', '×', '÷', '=', '<', '>', '≤', '≥', '≠', ','];

function bag(value: unknown): Record<string, unknown> {
  return value !== null && (typeof value === 'object' || typeof value === 'function')
    ? value as Record<string, unknown>
    : EMPTY;
}

function isoText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40
    && /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(value);
}

function integerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function sessionMeta(value: unknown): SessionMeta | undefined {
  const v = bag(value);
  if (typeof v.id !== 'string' || !/^[\w-]{1,80}$/.test(v.id) || !isoText(v.startedAt)) return undefined;
  return {
    id: v.id,
    startedAt: v.startedAt,
    ...(integerIn(v.anxiety, 1, 5) ? { anxiety: v.anxiety } : {}),
    ...(integerIn(v.energy, 1, 5) ? { energy: v.energy } : {}),
    ...(isoText(v.endedAt) ? { endedAt: v.endedAt } : {}),
    ...(typeof v.bankId === 'string' && /^[\w.-]{1,100}$/.test(v.bankId) ? { bankId: v.bankId } : {}),
    ...(typeof v.bankVersion === 'string' && /^[\w.-]{1,100}$/.test(v.bankVersion) ? { bankVersion: v.bankVersion } : {}),
    ...(integerIn(v.chapter, 0, 99) ? { chapter: v.chapter } : {}),
  };
}

function isShortString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max;
}

function normalizeChoices(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length < 2 || value.length > 12) return;
  return value.every(choice => isShortString(choice, 500) && choice.trim().length > 0) ? value : undefined;
}

function normalizePreferences(value: unknown): Preferences | undefined {
  if (!value) return;
  const prefs = bag(value);
  const symbols = (items: unknown, limit: number) => Array.isArray(items)
    ? items.filter((symbol): symbol is string => isShortString(symbol, 29)).slice(0, limit)
    : [];
  return { compact: prefs.compact !== false, favorites: symbols(prefs.favorites, 12), recent: symbols(prefs.recent, 4) };
}

/** Reconstruct a bounded allowlisted tree, discarding all unknown fields. */
export function validateSession(input: unknown): { doc: Document; prefs?: Preferences } {
  const data = bag(input);
  if (data.version !== 1 && data.version !== 2) throw Error('Unsupported session version.');
  const legacy = data.version === 1;
  const raw = legacy ? bag(data.state) : bag(data.doc);
  if (!Array.isArray(raw.exercises) || !raw.exercises.length || raw.exercises.length > MAX_SESSION_EXERCISES) {
    throw Error(`Invalid session. Use at most ${MAX_SESSION_EXERCISES} exercises.`);
  }

  const ids = new Set<string>();
  let count = 0;

  function id(value: unknown): string {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(value) || ids.has(value)) {
      throw Error('Invalid or duplicate ID.');
    }
    ids.add(value);
    return value;
  }

  function sequence(value: unknown, depth: number): Sequence {
    const v = bag(value);
    if (v.type !== 'sequence' || depth > 18 || !Array.isArray(v.children)
      || !v.children.length || v.children.length > 200 || ++count > 3000) throw Error('Invalid sequence.');
    return { id: id(v.id), type: 'sequence', children: v.children.map(child => node(child, depth + 1)) };
  }

  function node(value: unknown, depth: number): MathNode {
    if (!value || depth > 18 || ++count > 3000) throw Error('Session is too complex.');
    const v = bag(value);
    const nodeId = id(v.id);
    if (typeof v.value === 'string') {
      if ((v.type === 'number' && /^[0-9.]{0,60}$/.test(v.value))
        || (v.type === 'identifier' && /^[a-zA-Zπθ∞σ]$/.test(v.value))
        || (v.type === 'operator' && operators.includes(v.value))) return { id: nodeId, type: v.type, value: v.value };
    }
    if (v.type === 'fraction') {
      return { id: nodeId, type: v.type, numerator: sequence(v.numerator, depth + 1), denominator: sequence(v.denominator, depth + 1) };
    }
    if (v.type === 'power') {
      return { id: nodeId, type: v.type, base: sequence(v.base, depth + 1), exponent: sequence(v.exponent, depth + 1) };
    }
    if (v.type === 'root') return { id: nodeId, type: v.type, body: sequence(v.body, depth + 1) };
    if (v.type === 'group') {
      return { id: nodeId, type: v.type, body: sequence(v.body, depth + 1), ...(v.delim === 'bracket' ? { delim: 'bracket' } : {}) };
    }
    if (v.type === 'matrix' && (v.size === 2 || v.size === 3) && Array.isArray(v.cells) && v.cells.length === v.size ** 2) {
      return { id: nodeId, type: v.type, size: v.size, cells: v.cells.map(cell => sequence(cell, depth + 1)) };
    }
    if (v.type === 'template' && typeof v.kind === 'string' && Object.hasOwn(templateCounts, v.kind)
      && Array.isArray(v.args) && v.args.length === templateCounts[v.kind]) {
      return { id: nodeId, type: v.type, kind: v.kind, args: v.args.map(arg => sequence(arg, depth + 1)) };
    }
    throw Error('Invalid mathematical content.');
  }

  function step(value: unknown): Step {
    const s = bag(value);
    return {
      id: id(s.id),
      expression: sequence(s.expression, 0),
      final: s.final === true,
      ...(s.edited === true ? { edited: true } : {}),
      ...(typeof s.mathLatex === 'string' ? { mathLatex: s.mathLatex } : {}),
      status: s.status === 'needs-review' ? 'needs-review' : 'unchecked',
    };
  }

  const exercises = raw.exercises.map((value: unknown): Exercise => {
    metadataSchema.parse(value);
    const ex = bag(value);
    if (!isShortString(ex.source, 4000) || (ex.mode !== 'math' && ex.mode !== 'text')
      || !Array.isArray(ex.steps) || !ex.steps.length || ex.steps.length > 40) throw Error('Invalid exercise.');
    if (ex.steps.some(value => {
      const latex = bag(value).mathLatex;
      return latex !== undefined && !isShortString(latex, 4000);
    })) throw Error('Invalid saved math expression.');
    if (ex.steps.filter(value => bag(value).final).length > 1) throw Error('Only one final answer is allowed.');
    const candidate = ex.answerType;
    const choices = candidate === 'choice' ? normalizeChoices(ex.choices) : undefined;
    const answerType = candidate === 'math' || candidate === 'text' || candidate === 'true_false_why'
      || candidate === 'find_mistake' || (candidate === 'choice' && choices) ? candidate : undefined;
    const allowsAnswerText = answerType === 'text' || answerType === 'choice' || answerType === 'find_mistake';

    return {
      id: id(ex.id),
      source: ex.mode === 'math' ? ascii(ex.source) : ex.source,
      mode: ex.mode,
      ...(isShortString(ex.prompt, 3999) ? { prompt: ex.prompt } : {}),
      ...(answerType ? { answerType } : {}),
      ...(choices ? { choices } : {}),
      ...(allowsAnswerText && isShortString(ex.answerText, 4000) ? { answerText: ex.answerText } : {}),
      ...(answerType === 'true_false_why' && (ex.answerChoice === 'true' || ex.answerChoice === 'false')
        ? { answerChoice: ex.answerChoice } : {}),
      ...(answerType === 'true_false_why' && isShortString(ex.answerReason, 4000) ? { answerReason: ex.answerReason } : {}),
      ...(typeof ex.bankQuestionId === 'string' && /^[\w.-]{1,100}$/.test(ex.bankQuestionId) ? { bankQuestionId: ex.bankQuestionId } : {}),
      ...(ex.stage === 'learn' || ex.stage === 'practice' ? { stage: ex.stage } : {}),
      ...(typeof ex.conceptId === 'string' && /^[\w.-]{1,80}$/.test(ex.conceptId) ? { conceptId: ex.conceptId } : {}),
      ...(integerIn(ex.diagnosticId, 1, 30) ? { diagnosticId: ex.diagnosticId } : {}),
      ...(ex.assessment === 'fractions-round-1' ? { assessment: ex.assessment } : {}),
      ...(typeof ex.elapsedMs === 'number' && Number.isFinite(ex.elapsedMs) && ex.elapsedMs >= 0 ? { elapsedMs: ex.elapsedMs } : {}),
      ...(ex.confidence === 'high' || ex.confidence === 'medium' || ex.confidence === 'low' ? { confidence: ex.confidence } : {}),
      ...(ex.skipped === true ? { skipped: true } : {}),
      ...(isoText(ex.startedAt) ? { startedAt: ex.startedAt } : {}),
      ...(isoText(ex.submittedAt) ? { submittedAt: ex.submittedAt } : {}),
      ...(typeof ex.hintUsed === 'boolean' ? { hintUsed: ex.hintUsed } : {}),
      ...(isShortString(ex.hintNote, 500) ? { hintNote: ex.hintNote } : {}),
      ...(isShortString(ex.guidance, 2000) && ex.guidance.trim() ? { guidance: ex.guidance } : {}),
      ...(isoText(ex.guidanceOpenedAt) ? { guidanceOpenedAt: ex.guidanceOpenedAt } : {}),
      ...(typeof ex.timerRunningSince === 'number' && Number.isFinite(ex.timerRunningSince)
        && ex.timerRunningSince > 0 && ex.timerRunningSince <= Date.now() + 86_400_000 ? { timerRunningSince: ex.timerRunningSince } : {}),
      ...(ex.timerPaused === true ? { timerPaused: true } : {}),
      ...(isShortString(ex.migrationNotes, 5000) ? { migrationNotes: ex.migrationNotes } : {}),
      steps: ex.steps.map(step),
    };
  });
  const exerciseId = legacy ? raw.exercise : raw.exerciseId;
  const ex = exercises.find(exercise => exercise.id === exerciseId) ?? exercises.at(-1)!;
  const legacyGap = bag(raw.gap);
  const old = legacy
    ? { stepId: raw.step, nodeId: raw.node, offset: raw.caret, sequenceId: legacyGap.sequenceId, index: legacyGap.index }
    : bag(raw.cursor);
  const activeStep = ex.steps.find(step => step.id === old.stepId) ?? ex.steps.at(-1)!;
  const all = leaves(activeStep.expression);
  const leaf = all.find(item => item.node.id === old.nodeId)?.node ?? all[0].node;
  const offset = leaf.type === 'number' && typeof old.offset === 'number' && Number.isInteger(old.offset)
    ? Math.max(0, Math.min(leaf.value.length, old.offset)) : 0;
  const cursor: Cursor = { stepId: activeStep.id, nodeId: leaf.id, offset, sequenceId: null, index: 0, selected: null };

  // Restore only verified structural selections and sequence boundaries.
  function sequences(s: Sequence): Sequence[] {
    return [s, ...s.children.flatMap(n => fields(n).flatMap(([child]) => sequences(child)))];
  }
  const gap = sequences(activeStep.expression).find(s => s.id === old.sequenceId);
  if (gap && integerIn(old.index, 0, gap.children.length)) {
    cursor.sequenceId = gap.id;
    cursor.index = old.index;
    cursor.nodeId = null;
  }
  const session = sessionMeta(raw.session);
  return { doc: { ...(session ? { session } : {}), exercises, exerciseId: ex.id, cursor }, prefs: normalizePreferences(data.prefs) };
}

export function restoreState(): ScratchState {
  const state = initialState();
  try {
    const storage = getLearningStorage();
    const raw = storage.getItem(KEY) ?? storage.getItem('math-scratchpad-flow-v1');
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      const saved = validateSession(parsed);
      state.doc = saved.doc;
      if (saved.prefs) state.prefs = saved.prefs;
      state.keyboardOpen = bag(parsed).keyboardOpen === true;
    }
  } catch {
    state.notice = 'Previous draft could not be restored. Import a session backup if available.';
  }
  return state;
}
export const serialize = (state: ScratchState) =>
  JSON.stringify({ version: 2, doc: state.doc, prefs: state.prefs, keyboardOpen: state.keyboardOpen }, null, 2);

export function saveState(state: ScratchState): boolean {
  try {
    getLearningStorage().setItem(KEY, serialize(state));
    return true;
  } catch {
    return false;
  }
}
