import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import type { BankQuestion } from '../../../domain/entities/drive-bank.types';
import { emitLearnEvent, type LearnEventContext } from '../../../sync/events';
import { stepLatex } from '../../math-editor/model/model';
import type { ScratchStore } from '../../math-editor/store/editor-store';
import { createLessonMathStore } from '../lesson-math-check';
import type { LessonSection } from '../lesson-sections';
import { workAnswerHasContent, workAnswerHasCurrentContent, type LessonWorkItem } from '../lesson-work-items';
import { answerEventItemType, formatCheckAnswerText, formatWorkEventAnswer, questionEventItemType } from '../model/lesson-screen-helpers';
import { lessonCheckAnswerComplete, type LessonCheckAnswer, type LessonProgress, type LessonWorkAnswer } from '../types';

export type AnswerTelemetryDeps = {
  makeEventContext: (question?: BankQuestion, section?: LessonSection, conceptId?: string) => LearnEventContext;
  nextAttemptNo: (itemId: string) => number;
  markSectionGateAttempt: (section: LessonSection | undefined, question?: BankQuestion) => void;
  gateFailedSections: MutableRefObject<Set<string>>;
  pendingAnswerEdits: MutableRefObject<Map<string, ReturnType<typeof setTimeout>>>;
  pendingWorkEdits: MutableRefObject<Map<string, ReturnType<typeof setTimeout>>>;
  engageCheck: (questionId: string) => void;
  engageWorkItem: (item: LessonWorkItem) => void;
};

export function useLessonAnswers({
  phone,
  initialWorkAnswers,
  progress,
  progressRef,
  commitProgress,
  currentSection,
  checks,
  workItems,
  allQuestions,
  telemetry,
}: {
  phone: boolean;
  initialWorkAnswers?: Record<string, LessonWorkAnswer>;
  progress: LessonProgress;
  progressRef: MutableRefObject<LessonProgress>;
  commitProgress: (next: LessonProgress) => void;
  currentSection: LessonSection | undefined;
  checks: BankQuestion[];
  workItems: LessonWorkItem[];
  allQuestions: Map<string, BankQuestion>;
  telemetry: AnswerTelemetryDeps;
}) {
  const mathStores = useRef(new Map<string, ScratchStore>());
  const workStores = useRef(new Map<string, ScratchStore>());
  const [activeInlineCheckId, setActiveInlineCheckId] = useState<string | null>(null);
  const [activeInlineExampleKey, setActiveInlineExampleKey] = useState<string | null>(null);
  const [selectedWorkKey, setSelectedWorkKey] = useState<string | undefined>(() => Object.keys(initialWorkAnswers ?? {}).at(-1));
  const [skipQuestion, setSkipQuestion] = useState<BankQuestion | null>(null);
  const skipCheckInvoker = useRef<HTMLElement | null>(null);

  const getMathStore = useCallback((question: BankQuestion) => {
    let store = mathStores.current.get(question.id);
    if (!store) {
      const saved = progressRef.current.checkAnswers?.[question.id];
      store = createLessonMathStore(question, phone, saved?.type === 'math' ? saved.steps : undefined);
      mathStores.current.set(question.id, store);
    }
    return store;
  }, [phone, progressRef]);

  const getWorkStore = useCallback((item: LessonWorkItem) => {
    let store = workStores.current.get(item.key);
    if (!store) {
      const saved = progressRef.current.workAnswers?.[item.key];
      store = createLessonMathStore(item.workQuestion, phone, saved?.type === 'math' ? saved.steps : undefined);
      workStores.current.set(item.key, store);
    }
    return store;
  }, [phone, progressRef]);

  const selectWorkItem = useCallback((key: string) => {
    setSelectedWorkKey(key);
    const item = workItems.find(candidate => candidate.key === key);
    if (!item) return;
    if (item.kind === 'check') telemetry.engageCheck(item.question.id);
    else telemetry.engageWorkItem(item);
  }, [telemetry, workItems]);

  const isCheckComplete = useCallback(
    (questionId: string) => progress.answeredCheckIds.includes(questionId) || progress.skippedChecks.some(item => item.questionId === questionId),
    [progress.answeredCheckIds, progress.skippedChecks],
  );
  const conceptComplete = checks.every(question => isCheckComplete(question.id));

  const setWork = useCallback((key: string, incoming: LessonWorkAnswer) => {
    const before = progressRef.current;
    const workAnswers = { ...before.workAnswers };
    const previous = workAnswers[key];
    const legacyMathSteps = incoming.type === 'math' ? undefined : previous?.legacyMathSteps ?? (previous?.type === 'math' ? previous.steps : undefined);
    const answer: LessonWorkAnswer = incoming.type === 'math' || !legacyMathSteps ? incoming : { ...incoming, legacyMathSteps };
    const hasContent = workAnswerHasContent(answer);
    const signature = (value: LessonWorkAnswer | undefined) => !value ? '' : JSON.stringify(
      value.type === 'math'
        ? { type: value.type, steps: value.steps.map(step => stepLatex(step)), legacy: value.legacyMathSteps?.map(step => stepLatex(step)) }
        : value.type === 'true_false_why'
          ? { type: value.type, choice: value.choice, reason: value.reason, legacy: value.legacyMathSteps?.map(step => stepLatex(step)) }
          : { type: value.type, value: value.value, legacy: value.legacyMathSteps?.map(step => stepLatex(step)) },
    );
    if (!hasContent && !previous) return;
    if (signature(previous) === signature(answer)) return;
    if (!hasContent) delete workAnswers[key];
    else workAnswers[key] = answer;
    commitProgress({ ...before, workAnswers: Object.keys(workAnswers).length ? workAnswers : undefined });
    const item = workItems.find(candidate => candidate.key === key);
    if (!item || !hasContent || !workAnswerHasCurrentContent(answer)) return;
    const questionText = (item.kind === 'check' || item.kind === 'exercise') ? (item.question.prompt || item.question.source) : item.title;
    const itemId = item.kind === 'check' || item.kind === 'exercise' ? item.question.id : item.key;
    const context = telemetry.makeEventContext(item.kind === 'check' || item.kind === 'exercise' ? item.question : undefined, currentSection, item.kind === 'example' || item.kind === 'guided' ? item.conceptId : undefined);
    const eventItemType = answerEventItemType(answer);
    const eventAnswer = formatWorkEventAnswer(answer);
    const previousCurrentHasContent = previous?.type === 'math' && item.kind === 'exercise'
      && (item.workQuestion.answerType ?? (item.workQuestion.mode === 'text' ? 'text' : 'math')) !== 'math'
      ? false : workAnswerHasCurrentContent(previous);
    if (!previousCurrentHasContent) {
      const type = item.kind === 'example' || item.kind === 'guided' ? 'example_attempt' : item.kind === 'exercise' ? 'exercise_attempt' : 'check_answer';
      emitLearnEvent(context, { type, itemId, itemType: eventItemType, questionText, userAnswer: eventAnswer, ...(answer.type === 'math' ? { steps: answer.steps.map(step => stepLatex(step).slice(0, 4_000)).slice(0, 40) } : {}), verdict: 'submitted', verdictSource: 'none', attemptNo: telemetry.nextAttemptNo(itemId) });
    } else {
      const timer = telemetry.pendingWorkEdits.current.get(key);
      if (timer) clearTimeout(timer);
      const nextTimer = setTimeout(() => {
        telemetry.pendingWorkEdits.current.delete(key);
        const latest = progressRef.current.workAnswers?.[key];
        if (!latest || !workAnswerHasContent(latest)) return;
        emitLearnEvent(context, { type: latest.type === 'math' ? 'step_edited' : 'answer_edited', itemId, itemType: answerEventItemType(latest), questionText, userAnswer: formatWorkEventAnswer(latest), ...(latest.type === 'math' ? { steps: latest.steps.map(step => stepLatex(step).slice(0, 4_000)).slice(0, 40) } : {}) });
      }, 700);
      telemetry.pendingWorkEdits.current.set(key, nextTimer);
    }
    if (previous?.type === 'math' && answer.type === 'math' && answer.steps.length > previous.steps.length) {
      const eventSteps = answer.steps.map(step => stepLatex(step).slice(0, 4_000)).slice(0, 40);
      for (const added of answer.steps.slice(previous.steps.length)) emitLearnEvent(context, { type: 'step_added', itemId: added.id, itemType: 'step_by_step', questionText, steps: eventSteps });
    }
  }, [commitProgress, currentSection, progressRef, telemetry, workItems]);

  const setAnswer = useCallback((questionId: string, value: LessonCheckAnswer | null) => {
    const answered = lessonCheckAnswerComplete(value ?? undefined);
    const before = progressRef.current;
    const question = allQuestions.get(questionId);
    const previousAnswer = before.checkAnswers?.[questionId];
    const currentSignature = JSON.stringify(value);
    const previousSignature = JSON.stringify(previousAnswer);
    const checkAnswers = { ...before.checkAnswers };
    if (value) checkAnswers[questionId] = value;
    else delete checkAnswers[questionId];
    const answeredCheckIds = answered ? [...new Set([...before.answeredCheckIds, questionId])] : before.answeredCheckIds.filter(id => id !== questionId);
    const skippedChecks = value !== null ? before.skippedChecks.filter(item => item.questionId !== questionId) : before.skippedChecks;
    commitProgress({ ...before, answeredCheckIds, skippedChecks, ...(Object.keys(checkAnswers).length ? { checkAnswers } : { checkAnswers: undefined }) });
    if (!question || currentSignature === previousSignature) return;
    const context = telemetry.makeEventContext(question);
    const { answerText, steps } = formatCheckAnswerText(value);
    const baseFields = { itemId: question.id, itemType: questionEventItemType(question), questionText: (question.prompt || question.source).slice(0, 8_000), userAnswer: answerText.slice(0, 8_000), ...(steps ? { steps } : {}), verdict: 'submitted' as const, verdictSource: 'none' as const };
    if (answered && !before.answeredCheckIds.includes(questionId)) {
      emitLearnEvent(context, { ...baseFields, type: 'check_answer', attemptNo: telemetry.nextAttemptNo(questionId) });
      telemetry.markSectionGateAttempt(currentSection, question);
    } else {
      const existing = telemetry.pendingAnswerEdits.current.get(questionId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        telemetry.pendingAnswerEdits.current.delete(questionId);
        emitLearnEvent(context, { ...baseFields, type: 'answer_edited', ...(answered ? {} : { note: 'Response cleared.' }) });
      }, 700);
      telemetry.pendingAnswerEdits.current.set(questionId, timer);
    }
  }, [allQuestions, commitProgress, currentSection, progressRef, telemetry]);

  const setConfidence = useCallback((questionId: string, value: 1 | 2 | 3 | 4 | 5) => {
    const before = progressRef.current;
    commitProgress({ ...before, confidenceByCheckId: { ...before.confidenceByCheckId, [questionId]: value } });
    const question = allQuestions.get(questionId);
    if (question) emitLearnEvent(telemetry.makeEventContext(question), { type: 'confidence_set', itemId: question.id, confidence: value, questionText: (question.prompt || question.source).slice(0, 8_000) });
  }, [allQuestions, commitProgress, progressRef, telemetry]);

  function confirmSkip() {
    if (!skipQuestion) return;
    const before = progressRef.current;
    const skippedChecks = before.skippedChecks.some(item => item.questionId === skipQuestion.id) ? before.skippedChecks : [...before.skippedChecks, { questionId: skipQuestion.id, at: new Date().toISOString() }];
    commitProgress({ ...before, skippedChecks });
    emitLearnEvent(telemetry.makeEventContext(skipQuestion), { type: 'check_skipped', itemId: skipQuestion.id, itemType: questionEventItemType(skipQuestion), questionText: (skipQuestion.prompt || skipQuestion.source).slice(0, 8_000) });
    telemetry.markSectionGateAttempt(currentSection, skipQuestion);
    if (currentSection && !telemetry.gateFailedSections.current.has(currentSection.id)) {
      telemetry.gateFailedSections.current.add(currentSection.id);
      emitLearnEvent(telemetry.makeEventContext(skipQuestion, currentSection), { type: 'gate_failed', itemId: currentSection.id, questionText: currentSection.title ?? currentSection.id, note: 'A quick check was skipped; section navigation remains available after the remaining checks are answered or skipped.' });
    }
    setSkipQuestion(null);
  }

  function revealStep(key: string, value: number) {
    const before = progressRef.current;
    commitProgress({ ...before, revealedSteps: { ...before.revealedSteps, [key]: value } });
    if (value > (before.revealedSteps[key] ?? 0)) {
      const [conceptId, blockIndexText] = key.split(':');
      const concept = currentSection?.concepts.find(entry => entry.concept.id === conceptId)?.concept;
      const block = concept?.blocks[Number(blockIndexText)];
      emitLearnEvent(telemetry.makeEventContext(undefined, currentSection, conceptId), { type: block?.type === 'example' ? 'example_revealed' : 'content_revealed', itemId: key, ...(block?.type === 'example' ? { questionText: [block.title, block.text, block.latex].filter(Boolean).join('\n').slice(0, 8_000) } : {}) });
    }
  }

  function revealWorkSolution(item: LessonWorkItem) {
    if (item.kind !== 'example') return;
    const fullText = [item.title, item.block.type === 'example' ? item.block.text : '', item.block.type === 'example' ? item.block.latex : ''].filter(Boolean).join('\n');
    emitLearnEvent(telemetry.makeEventContext(undefined, currentSection, item.conceptId), { type: 'example_revealed', itemId: item.key, itemType: 'step_by_step', questionText: fullText.slice(0, 8_000), note: 'Learner requested comparison after writing work.' });
  }

  return {
    getMathStore, getWorkStore, activeInlineCheckId, setActiveInlineCheckId,
    activeInlineExampleKey, setActiveInlineExampleKey, selectedWorkKey, setSelectedWorkKey,
    selectWorkItem, isCheckComplete, conceptComplete, setAnswer, setConfidence, setWork,
    revealStep, revealWorkSolution, skipQuestion, setSkipQuestion, skipCheckInvoker, confirmSkip,
  };
}
