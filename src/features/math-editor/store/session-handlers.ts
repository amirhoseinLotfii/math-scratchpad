import {
  blankStep,
  clone,
  leaves,
  stepLatex,
  uid,
  type Document,
  type Exercise,
  type Preferences,
  type SessionMeta,
  isoLocal,
  elapsedAt,
} from '../../../model';

import { exerciseOf, initialDocument, newSessionMeta, type ScratchState, type PayloadAction } from './editor-state';
import { focusFirst } from './editor-cursor';
import { diagnosticQuestions } from '../../../diagnostic';
import { fractionRoundOne } from '../../../fraction-round-one';
import { validScale } from '../model/model';
import { invalidateSubmission } from './edit-handlers';
export const sessionHandlers = {
  adjacentExercise(state: ScratchState, action: PayloadAction<-1 | 1>) {
    const d = state.doc,
      index = d.exercises.findIndex((x) => x.id === d.exerciseId);
    const target = d.exercises[index + action.payload];
    if (!target) return;
    d.exerciseId = target.id;
    const line = target.steps.at(-1)!;
    d.cursor.stepId = line.id;
    focusFirst(d, line.expression);
    state.notice = '';
  },
  setConfidence(state: ScratchState, action: PayloadAction<'high' | 'medium' | 'low'>) {
    const ex = exerciseOf(state.doc);
    ex.confidence = action.payload;
    ex.submittedAt = isoLocal();
  },
  setAnswerText(
    state: ScratchState,
    action: PayloadAction<{ value: string; answerType?: 'text' | 'choice' | 'find_mistake'; choices?: string[] }>,
  ) {
    const ex = exerciseOf(state.doc);
    const previousType = ex.answerType;
    const previousAnswer = ex.answerText ?? '';
    const previousChoices = JSON.stringify(ex.choices ?? []);
    if (action.payload.answerType === 'text' || action.payload.answerType === 'choice' || action.payload.answerType === 'find_mistake')
      ex.answerType = action.payload.answerType;
    if (
      ex.answerType === 'choice' &&
      action.payload.choices &&
      action.payload.choices.length >= 2 &&
      action.payload.choices.length <= 12 &&
      action.payload.choices.every((choice) => typeof choice === 'string' && choice.trim() && choice.length <= 500)
    )
      ex.choices = [...action.payload.choices];
    const answer = action.payload.value.slice(0, 4000);
    if (answer) {
      ex.answerText = answer;
      if (!ex.startedAt) ex.startedAt = isoLocal();
    } else delete ex.answerText;
    if (previousType !== ex.answerType || previousAnswer !== (ex.answerText ?? '') || previousChoices !== JSON.stringify(ex.choices ?? []))
      invalidateSubmission(ex);
  },
  setTrueFalseWhy(state: ScratchState, action: PayloadAction<{ choice?: 'true' | 'false'; reason: string }>) {
    const ex = exerciseOf(state.doc);
    if (ex.answerType !== 'true_false_why') return;
    const previousChoice = ex.answerChoice;
    const previousReason = ex.answerReason ?? '';
    if (action.payload.choice === 'true' || action.payload.choice === 'false') ex.answerChoice = action.payload.choice;
    else delete ex.answerChoice;
    const reason = action.payload.reason.slice(0, 4000);
    if (reason) ex.answerReason = reason;
    else delete ex.answerReason;
    if ((ex.answerChoice || reason.trim()) && !ex.startedAt) ex.startedAt = isoLocal();
    if (previousChoice !== ex.answerChoice || previousReason !== (ex.answerReason ?? '')) invalidateSubmission(ex);
  },
  setHint(state: ScratchState, action: PayloadAction<{ used: boolean; note?: string }>) {
    const ex = exerciseOf(state.doc);
    ex.hintUsed = action.payload.used;
    const note = action.payload.note?.slice(0, 500);
    if (note) ex.hintNote = note;
    else delete ex.hintNote;
  },
  openGuidance(state: ScratchState) {
    const ex = exerciseOf(state.doc);
    if (!ex.guidance) return;
    if (!ex.guidanceOpenedAt) ex.guidanceOpenedAt = isoLocal();
  },
  /** Before leaving a question with confirmed confidence: mark the last non-empty step Final when nothing is Final. */
  autoFinal(state: ScratchState) {
    const ex = exerciseOf(state.doc);
    if (ex.skipped || ex.steps.some((s) => s.final)) return;
    const lastWork = [...ex.steps].reverse().find((s) => stepLatex(s) !== '\\square');
    if (lastWork) lastWork.final = true;
  },
  setSessionMeta(state: ScratchState, action: PayloadAction<Partial<Omit<SessionMeta, 'id' | 'startedAt'>>>) {
    const meta = state.doc.session ?? (state.doc.session = newSessionMeta());
    const { anxiety, energy, ...rest } = action.payload;
    Object.assign(meta, rest);
    for (const [k, v] of [
      ['anxiety', anxiety],
      ['energy', energy],
    ] as const) {
      if (!(k in action.payload)) continue;
      const ok = validScale(v);
      if (ok) meta[k] = ok;
      else delete meta[k];
    }
  },
  resetSession(state: ScratchState) {
    state.doc = initialDocument();
    state.past = [];
    state.future = [];
    state.copies = {};
    state.notice = 'Session reset. A new session has started.';
  },
  setSkipped(state: ScratchState, action: PayloadAction<boolean>) {
    exerciseOf(state.doc).skipped = action.payload;
  },
  startDiagnostic(state: ScratchState) {
    const previous = clone(state.doc);
    const exercises: Exercise[] = diagnosticQuestions.map((q) => ({
      id: uid(),
      mode: 'math',
      source: q.source,
      prompt: q.stem,
      diagnosticId: q.id,
      steps: [blankStep()],
    }));
    state.past.push(previous);
    if (state.past.length > 80) state.past.shift();
    state.future = [];
    const first = exercises[0];
    state.doc = {
      session: newSessionMeta(),
      exercises,
      exerciseId: first.id,
      cursor: {
        stepId: first.steps[0].id,
        nodeId: leaves(first.steps[0].expression)[0].node.id,
        sequenceId: null,
        index: 0,
        offset: 0,
        selected: null,
      },
    };
    state.notice = '30-question diagnostic ready. Answers are never shown during the test.';
  },
  startFractionRound(state: ScratchState) {
    const previous = clone(state.doc);
    const exercises: Exercise[] = fractionRoundOne.map((q) => ({
      id: uid(),
      mode: q.source ? 'math' : 'text',
      source: q.source || ' ',
      prompt: q.stem,
      assessment: 'fractions-round-1',
      diagnosticId: q.id,
      steps: [blankStep()],
    }));
    state.past.push(previous);
    if (state.past.length > 80) state.past.shift();
    state.future = [];
    const first = exercises[0];
    state.doc = {
      session: newSessionMeta(),
      exercises,
      exerciseId: first.id,
      cursor: {
        stepId: first.steps[0].id,
        nodeId: leaves(first.steps[0].expression)[0].node.id,
        sequenceId: null,
        index: 0,
        offset: 0,
        selected: null,
      },
    };
    state.notice = 'Round 1: 20 fraction questions ready. Answers are never shown during the test.';
  },
  /** Opens a timing segment for the shown question and closes any other question's open segment. */
  timerStart(state: ScratchState, action: PayloadAction<{ exerciseId: string; now: number }>) {
    const { exerciseId, now } = action.payload;
    if (!Number.isFinite(now)) return;
    for (const ex of state.doc.exercises) {
      if (ex.id === exerciseId) {
        if (!ex.timerPaused && !Number.isFinite(ex.timerRunningSince)) ex.timerRunningSince = now;
      } else if (Number.isFinite(ex.timerRunningSince)) {
        ex.elapsedMs = elapsedAt(ex, now);
        delete ex.timerRunningSince;
      }
    }
  },
  timerPause(state: ScratchState, action: PayloadAction<{ exerciseId: string; now: number; paused: boolean }>) {
    const ex = state.doc.exercises.find((x) => x.id === action.payload.exerciseId);
    if (!ex) return;
    if (action.payload.paused) {
      if (Number.isFinite(ex.timerRunningSince)) ex.elapsedMs = elapsedAt({ ...ex, timerPaused: false }, action.payload.now);
      delete ex.timerRunningSince;
      ex.timerPaused = true;
    } else {
      delete ex.timerPaused;
      ex.timerRunningSince = action.payload.now;
    }
  },
  addQuestionTime(state: ScratchState, action: PayloadAction<{ exerciseId: string; milliseconds: number }>) {
    const ex = state.doc.exercises.find((x) => x.id === action.payload.exerciseId);
    if (ex && Number.isFinite(action.payload.milliseconds) && action.payload.milliseconds >= 0)
      ex.elapsedMs = (ex.elapsedMs ?? 0) + action.payload.milliseconds;
  },
  switchExercise(state: ScratchState, action: PayloadAction<string>) {
    const ex = state.doc.exercises.find((x) => x.id === action.payload);
    if (ex) {
      state.doc.exerciseId = ex.id;
      const last = ex.steps.at(-1)!;
      state.doc.cursor.stepId = last.id;
      focusFirst(state.doc, last.expression);
      state.notice = '';
    }
  },
  load(state: ScratchState, action: PayloadAction<{ doc: Document; prefs?: Preferences }>) {
    state.past = [];
    state.future = [];
    state.doc = action.payload.doc;
    if (action.payload.prefs) state.prefs = action.payload.prefs;
    state.copies = {};
    state.notice = 'Session restored.';
  },
};
