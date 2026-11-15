import { useState } from 'react';
import { Button } from '../../shared/ui/button';
import type { BankQuestion } from '../drive-bank/drive-bank';
import { LessonCheck } from './lesson-check';
import { type LessonWorkItem } from './lesson-work-items';
import { emitLearnEvent } from '../../sync/events';

import { InlineExampleEditor } from './lesson-section-content';
import { useLessonWork } from './use-lesson-work';
import { useLessonGate } from './use-lesson-gate';
import type { Dispatch, SetStateAction, RefObject } from 'react';
import type { LessonEventContextFor, LessonProgressWriter } from './lesson-screen-types';
import type { LessonSection } from './lesson-sections';
import type { LessonProgress } from './types';
export type { LessonRestoreTarget } from './lesson-screen-types';
type Options = {
  currentSection?: LessonSection;
  progress: LessonProgress;
  progressRef: RefObject<LessonProgress>;
  commitProgress: LessonProgressWriter;
  makeEventContext: LessonEventContextFor;
  workItems: LessonWorkItem[];
  checks: BankQuestion[];
  split: boolean;
  uiLang: 'fa' | 'en';
  fa: boolean;
  setSelectedWorkKey: Dispatch<SetStateAction<string | undefined>>;
  getWorkStore: ReturnType<typeof useLessonWork>['getWorkStore'];
  getMathStore: ReturnType<typeof useLessonWork>['getMathStore'];
  setWork: ReturnType<typeof useLessonWork>['setWork'];
  engageCheck: (id: string) => void;
  engageWorkItem: (item: LessonWorkItem) => void;
  leaveCheck: (id: string) => void;
  setAnswer: ReturnType<typeof useLessonGate>['setAnswer'];
  setConfidence: ReturnType<typeof useLessonGate>['setConfidence'];
  skipCheckInvoker: RefObject<HTMLElement | null>;
  setSkipQuestion: (value: BankQuestion | null) => void;
  allQuestions: Map<string, BankQuestion>;
};
export function useLessonRenderers({
  currentSection,
  progress,
  progressRef,
  commitProgress,
  makeEventContext,
  workItems,
  checks,
  split,
  uiLang,
  fa,
  setSelectedWorkKey,
  getWorkStore,
  getMathStore,
  setWork,
  engageCheck,
  engageWorkItem,
  leaveCheck,
  setAnswer,
  setConfidence,
  skipCheckInvoker,
  setSkipQuestion,
  allQuestions,
}: Options) {
  const [activeInlineCheckId, setActiveInlineCheckId] = useState<string | null>(null);
  const [activeInlineExampleKey, setActiveInlineExampleKey] = useState<string | null>(null);
  function revealStep(key: string, value: number) {
    const before = progressRef.current;
    commitProgress({ ...before, revealedSteps: { ...before.revealedSteps, [key]: value } });
    if (value > (before.revealedSteps[key] ?? 0)) {
      const [conceptId, blockIndexText] = key.split(':');
      const concept = currentSection?.concepts.find((entry) => entry.concept.id === conceptId)?.concept;
      const block = concept?.blocks[Number(blockIndexText)];
      emitLearnEvent(makeEventContext(undefined, currentSection, conceptId), {
        type: block?.type === 'example' ? 'example_revealed' : 'content_revealed',
        itemId: key,
        ...(block?.type === 'example'
          ? { questionText: [block.title, block.text, block.latex].filter(Boolean).join('\n').slice(0, 8_000) }
          : {}),
      });
    }
  }

  function selectWorkItem(key: string) {
    setSelectedWorkKey(key);
    const item = workItems.find((candidate) => candidate.key === key);
    if (!item) return;
    if (item.kind === 'check') engageCheck(item.question.id);
    else engageWorkItem(item);
  }

  function revealWorkSolution(item: LessonWorkItem) {
    if (item.kind !== 'example') return;
    const fullText = [
      item.title,
      item.block.type === 'example' ? item.block.text : '',
      item.block.type === 'example' ? item.block.latex : '',
    ]
      .filter(Boolean)
      .join('\n');
    emitLearnEvent(makeEventContext(undefined, currentSection, item.conceptId), {
      type: 'example_revealed',
      itemId: item.key,
      itemType: 'step_by_step',
      questionText: fullText.slice(0, 8_000),
      note: 'Learner requested comparison after writing work.',
    });
  }

  const renderExampleWork = (blockKey: string) => {
    const item = workItems.find((candidate) => candidate.key === `ex:${blockKey}` && candidate.kind === 'example');
    if (!item) return null;
    const open = activeInlineExampleKey === item.key;
    return (
      <div className="lesson-example-work" aria-label={fa ? 'حل همین مثال' : 'Solve this example'}>
        <Button
          aria-expanded={!split && open}
          onClick={() => {
            setSelectedWorkKey(item.key);
            if (split) {
              requestAnimationFrame(() => document.querySelector<HTMLElement>('.lesson-work-select')?.focus({ preventScroll: true }));
            } else {
              setActiveInlineExampleKey((previous) => (previous === item.key ? null : item.key));
              if (!open)
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => {
                    const examples = [...document.querySelectorAll<HTMLElement>('.lesson-example-with-work')];
                    const current = examples.find((element) => element.querySelector('.lesson-example-work .lesson-math-editor') !== null);
                    current?.querySelector<HTMLElement>('.lesson-example-work math-field')?.focus({ preventScroll: false });
                  }),
                );
            }
          }}
        >
          {split
            ? fa
              ? 'حل در پنل کار من'
              : 'Solve in Your work'
            : open
              ? fa
                ? 'بستن حل این مثال'
                : 'Close example editor'
              : fa
                ? 'حل این مثال در همین‌جا'
                : 'Solve this example here'}
        </Button>
        {!split && open && <InlineExampleEditor item={item} uiLang={uiLang} getWorkStore={getWorkStore} onWork={setWork} />}
      </div>
    );
  };

  const firstMathCheckId = checks.find(
    (question) => question.answerType === 'math' || (!question.answerType && question.mode === 'math'),
  )?.id;
  const currentInlineCheckId = checks.some((question) => question.id === activeInlineCheckId) ? activeInlineCheckId : firstMathCheckId;
  const renderCheck = (question: BankQuestion, inline = false) => (
    <LessonCheck
      key={question.id}
      question={question}
      uiLang={uiLang}
      compact={
        inline &&
        question.id !== currentInlineCheckId &&
        (question.answerType === 'math' || (!question.answerType && question.mode === 'math'))
      }
      onExpand={() => {
        setActiveInlineCheckId(question.id);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const article = [...document.querySelectorAll<HTMLElement>('.lesson-check')].find(
              (element) => element.dataset.checkId === question.id,
            );
            article?.querySelector<HTMLElement>('math-field')?.focus({ preventScroll: false });
          }),
        );
      }}
      mathStore={question.answerType === 'math' || (!question.answerType && question.mode === 'math') ? getMathStore(question) : undefined}
      answer={progress.checkAnswers?.[question.id]}
      answered={progress.answeredCheckIds.includes(question.id)}
      confidence={progress.confidenceByCheckId?.[question.id]}
      skipped={progress.skippedChecks.some((item) => item.questionId === question.id)}
      onAnswer={setAnswer}
      onConfidence={setConfidence}
      onSkip={(questionId) => {
        skipCheckInvoker.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setSkipQuestion(allQuestions.get(questionId) ?? null);
      }}
      onEngage={engageCheck}
      onLeave={leaveCheck}
    />
  );

  return { revealStep, selectWorkItem, revealWorkSolution, renderExampleWork, renderCheck };
}
