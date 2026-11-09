import { useEffect, useRef, type RefObject } from 'react';
import { exerciseOf, type ScratchStore } from '../store';
import { stepLatex } from '../model';
import { contextForQuestion, emitLearnEvent } from '../sync/events';
import type { LoadedBank } from './use-bank-session';

/** Emits debounced practice learn events (answer/step edits, confidence, skips, hints) from store changes to the current exercise. */
export function usePracticeEditEvents(store: ScratchStore, loadedBankRef: RefObject<LoadedBank | null>) {
 const pendingAppEvents = useRef(new Map<string, ReturnType<typeof setTimeout>>());
 const appStoreStateRef = useRef(store.getState());
 useEffect(() => {
  const unsubscribe = store.subscribe(next => {
   const previous = appStoreStateRef.current;
   appStoreStateRef.current = next;
   const before = exerciseOf(previous.doc), after = exerciseOf(next.doc);
   if (before.id !== after.id) return;
   const bank = loadedBankRef.current;
   const question = bank?.bank.questions.find(item => item.id === after.bankQuestionId);
   const context = contextForQuestion({
    bankVersion: bank?.version ?? 'unknown', session: next.doc.session?.id ?? 'unknown', chapter: bank?.bank.chapter?.number,
    lesson: question?.lessonId, section: question?.sectionId, concept: question?.conceptId, question,
   });
   const itemId = question?.id ?? after.id;
   const questionText = (after.prompt || after.source).slice(0, 8_000);
   if (before.answerText !== after.answerText) {
    const key = `answer:${after.id}`;
    const previousTimer = pendingAppEvents.current.get(key);
    if (previousTimer) clearTimeout(previousTimer);
    pendingAppEvents.current.set(key, setTimeout(() => {
     pendingAppEvents.current.delete(key);
     emitLearnEvent(context, { type: 'answer_edited', itemId, itemType: after.answerType === 'choice' ? 'mcq' : after.answerType === 'text' ? 'typed' : 'step_by_step', questionText, userAnswer: (after.answerText ?? '').slice(0, 8_000) });
    }, 650));
   }
   const beforeIds = new Set(before.steps.map(step => step.id));
   const added = after.steps.filter(step => !beforeIds.has(step.id));
   const steps = after.steps.map(step => stepLatex(step).slice(0, 4_000)).slice(0, 40);
   if (added.length) {
    for (const step of added) emitLearnEvent(context, { type: 'step_added', itemId: step.id, itemType: 'step_by_step', questionText, steps });
   } else if (before.steps.map(step => `${step.id}:${stepLatex(step)}:${step.final}`).join('|') !== after.steps.map(step => `${step.id}:${stepLatex(step)}:${step.final}`).join('|')) {
    const key = `steps:${after.id}`;
    const previousTimer = pendingAppEvents.current.get(key);
    if (previousTimer) clearTimeout(previousTimer);
    pendingAppEvents.current.set(key, setTimeout(() => {
     pendingAppEvents.current.delete(key);
     emitLearnEvent(context, { type: 'step_edited', itemId: after.steps.find(step => step.id === next.doc.cursor.stepId)?.id ?? itemId, itemType: 'step_by_step', questionText, steps });
    }, 650));
   }
   if (before.confidence !== after.confidence && after.confidence) emitLearnEvent(context, { type: 'confidence_set', itemId, itemType: 'step_by_step', questionText, confidence: after.confidence });
   if (!before.skipped && after.skipped) emitLearnEvent(context, { type: 'check_skipped', itemId, questionText });
   if (!before.guidanceOpenedAt && after.guidanceOpenedAt) emitLearnEvent(context, { type: 'hint_used', itemId, questionText, hintLevel: 1 });
  });
  return () => {
   unsubscribe();
   for (const timer of pendingAppEvents.current.values()) clearTimeout(timer);
   pendingAppEvents.current.clear();
  };
 }, [store]);
}
