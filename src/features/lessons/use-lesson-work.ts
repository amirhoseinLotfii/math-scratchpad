import { useCallback, useRef } from 'react';
import type { BankQuestion } from '../drive-bank/drive-bank';
import { type LessonProgress } from './types';
import { type LessonSection } from './lesson-sections';
import { createLessonMathStore } from './lesson-math-check';
import type { ScratchStore } from '../../store';
import { stepLatex } from '../../model';
import { workAnswerHasContent, workAnswerHasCurrentContent, type LessonWorkItem } from './lesson-work-items';
import type { LessonWorkAnswer } from './types';
import { emitLearnEvent } from '../../sync/events';

import type { RefObject } from 'react';
import type { LessonEventContextFor, LessonProgressWriter } from './lesson-screen-types';
type PendingEdits = RefObject<Map<string, ReturnType<typeof setTimeout>>>;

type Options = {
  progressRef: RefObject<LessonProgress>;
  commitProgress: LessonProgressWriter;
  currentSection?: LessonSection;
  makeEventContext: LessonEventContextFor;

  phone: boolean;
  workItems: LessonWorkItem[];
  nextAttemptNo: (id: string) => number;
  pendingWorkEdits: PendingEdits;
};
export function useLessonWork({
  phone,
  progressRef,
  commitProgress,
  workItems,
  currentSection,
  makeEventContext,
  nextAttemptNo,
  pendingWorkEdits,
}: Options) {
  const mathStores = useRef(new Map<string, ScratchStore>());
  const workStores = useRef(new Map<string, ScratchStore>());
  const getMathStore = useCallback(
    (question: BankQuestion) => {
      let store = mathStores.current.get(question.id);
      if (!store) {
        const saved = progressRef.current.checkAnswers?.[question.id];
        store = createLessonMathStore(question, phone, saved?.type === 'math' ? saved.steps : undefined);
        mathStores.current.set(question.id, store);
      }
      return store;
    },
    [phone],
  );

  const getWorkStore = useCallback(
    (item: LessonWorkItem) => {
      let store = workStores.current.get(item.key);
      if (!store) {
        const saved = progressRef.current.workAnswers?.[item.key];
        store = createLessonMathStore(item.workQuestion, phone, saved?.type === 'math' ? saved.steps : undefined);
        workStores.current.set(item.key, store);
      }
      return store;
    },
    [phone],
  );

  const setWork = useCallback(
    (key: string, incoming: LessonWorkAnswer) => {
      const before = progressRef.current;
      const workAnswers = { ...before.workAnswers };
      const previous = workAnswers[key];
      const legacyMathSteps =
        incoming.type === 'math' ? undefined : (previous?.legacyMathSteps ?? (previous?.type === 'math' ? previous.steps : undefined));
      const answer: LessonWorkAnswer = incoming.type === 'math' || !legacyMathSteps ? incoming : { ...incoming, legacyMathSteps };
      const hasContent = workAnswerHasContent(answer);
      const signature = (value: LessonWorkAnswer | undefined) =>
        !value
          ? ''
          : JSON.stringify(
              value.type === 'math'
                ? {
                    type: value.type,
                    steps: value.steps.map((step) => stepLatex(step)),
                    legacy: value.legacyMathSteps?.map((step) => stepLatex(step)),
                  }
                : value.type === 'true_false_why'
                  ? {
                      type: value.type,
                      choice: value.choice,
                      reason: value.reason,
                      legacy: value.legacyMathSteps?.map((step) => stepLatex(step)),
                    }
                  : { type: value.type, value: value.value, legacy: value.legacyMathSteps?.map((step) => stepLatex(step)) },
            );
      if (!hasContent && !previous) return;
      if (signature(previous) === signature(answer)) return;
      if (!hasContent) delete workAnswers[key];
      else workAnswers[key] = answer;
      commitProgress({ ...before, workAnswers: Object.keys(workAnswers).length ? workAnswers : undefined });
      const item = workItems.find((candidate) => candidate.key === key);
      if (!item || !hasContent || !workAnswerHasCurrentContent(answer)) return;
      const questionText = item.kind === 'check' || item.kind === 'exercise' ? item.question.prompt || item.question.source : item.title;
      const itemId = item.kind === 'check' || item.kind === 'exercise' ? item.question.id : item.key;
      const context = makeEventContext(
        item.kind === 'check' || item.kind === 'exercise' ? item.question : undefined,
        currentSection,
        item.kind === 'example' || item.kind === 'guided' ? item.conceptId : undefined,
      );
      const eventItemType =
        answer.type === 'math'
          ? 'step_by_step'
          : answer.type === 'choice'
            ? 'mcq'
            : answer.type === 'true_false_why'
              ? 'true_false_why'
              : answer.type === 'find_mistake'
                ? 'find_mistake'
                : 'typed';
      const eventAnswer =
        answer.type === 'math'
          ? answer.steps
              .map((step) => stepLatex(step).slice(0, 4_000))
              .slice(0, 40)
              .join('\n')
              .slice(0, 8_000)
          : answer.type === 'true_false_why'
            ? [answer.choice ? (answer.choice === 'true' ? 'True' : 'False') : '', answer.reason]
                .filter(Boolean)
                .join(' — ')
                .slice(0, 8_000)
            : answer.value.slice(0, 8_000);
      const previousCurrentHasContent =
        previous?.type === 'math' &&
        item.kind === 'exercise' &&
        (item.workQuestion.answerType ?? (item.workQuestion.mode === 'text' ? 'text' : 'math')) !== 'math'
          ? false
          : workAnswerHasCurrentContent(previous);
      if (!previousCurrentHasContent) {
        const type =
          item.kind === 'example' || item.kind === 'guided'
            ? 'example_attempt'
            : item.kind === 'exercise'
              ? 'exercise_attempt'
              : 'check_answer';
        emitLearnEvent(context, {
          type,
          itemId,
          itemType: eventItemType,
          questionText,
          userAnswer: eventAnswer,
          ...(answer.type === 'math' ? { steps: answer.steps.map((step) => stepLatex(step).slice(0, 4_000)).slice(0, 40) } : {}),
          verdict: 'submitted',
          verdictSource: 'none',
          attemptNo: nextAttemptNo(itemId),
        });
      } else {
        const timer = pendingWorkEdits.current.get(key);
        if (timer) clearTimeout(timer);
        const nextTimer = setTimeout(() => {
          pendingWorkEdits.current.delete(key);
          const latest = progressRef.current.workAnswers?.[key];
          if (!latest || !workAnswerHasContent(latest)) return;
          const latestAnswer =
            latest.type === 'math'
              ? latest.steps
                  .map((step) => stepLatex(step).slice(0, 4_000))
                  .slice(0, 40)
                  .join('\n')
                  .slice(0, 8_000)
              : latest.type === 'true_false_why'
                ? [latest.choice ? (latest.choice === 'true' ? 'True' : 'False') : '', latest.reason]
                    .filter(Boolean)
                    .join(' — ')
                    .slice(0, 8_000)
                : latest.value.slice(0, 8_000);
          const latestType =
            latest.type === 'math'
              ? 'step_by_step'
              : latest.type === 'choice'
                ? 'mcq'
                : latest.type === 'true_false_why'
                  ? 'true_false_why'
                  : latest.type === 'find_mistake'
                    ? 'find_mistake'
                    : 'typed';
          emitLearnEvent(context, {
            type: latest.type === 'math' ? 'step_edited' : 'answer_edited',
            itemId,
            itemType: latestType,
            questionText,
            userAnswer: latestAnswer,
            ...(latest.type === 'math' ? { steps: latest.steps.map((step) => stepLatex(step).slice(0, 4_000)).slice(0, 40) } : {}),
          });
        }, 700);
        pendingWorkEdits.current.set(key, nextTimer);
      }
      if (previous?.type === 'math' && answer.type === 'math' && answer.steps.length > previous.steps.length) {
        const eventSteps = answer.steps.map((step) => stepLatex(step).slice(0, 4_000)).slice(0, 40);
        for (const added of answer.steps.slice(previous.steps.length))
          emitLearnEvent(context, { type: 'step_added', itemId: added.id, itemType: 'step_by_step', questionText, steps: eventSteps });
      }
    },
    [commitProgress, currentSection, makeEventContext, nextAttemptNo, workItems],
  );

  return { getMathStore, getWorkStore, setWork };
}
