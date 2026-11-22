import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { BankQuestion, DriveBank } from '../../../domain/entities/drive-bank.types';
import type { ActivityTracker } from '../../../sync/activity-tracker';
import { emitLearnEvent, type LearnEventContext } from '../../../sync/events';
import { sectionAnchorId } from '../../progress/reading-position-anchors';
import { useOptionalReadingPositionContext } from '../../progress/reading-position-context';
import type { LessonSection } from '../lesson-sections';
import type { LessonWorkItem } from '../lesson-work-items';
import { buildLessonEventContext, questionEventItemType } from '../model/lesson-screen-helpers';
import type { Lesson } from '../types';

export function useLessonTelemetry({
  bank,
  lesson,
  currentSection,
  summary,
  allQuestions,
  activityTracker,
  eventContext,
}: {
  bank: DriveBank;
  lesson: Lesson;
  currentSection: LessonSection | undefined;
  summary: boolean;
  allQuestions: Map<string, BankQuestion>;
  activityTracker?: ActivityTracker;
  eventContext?: LearnEventContext;
}) {
  const trackPosition = useOptionalReadingPositionContext()?.trackPosition;
  const focusedCheckScope = useRef<string | null>(null);
  const focusedWorkScope = useRef<string | null>(null);
  const attemptCounts = useRef(new Map<string, number>());
  const gateAttemptedSections = useRef(new Set<string>());
  const gateFailedSections = useRef(new Set<string>());
  const pendingAnswerEdits = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingWorkEdits = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const lessonEventContext = useMemo(
    () => buildLessonEventContext(bank, lesson, eventContext),
    [bank, eventContext, lesson],
  );

  const makeEventContext = useCallback(
    (question?: BankQuestion, section = currentSection, conceptId?: string): LearnEventContext => ({
      ...lessonEventContext,
      section: question?.sectionId ?? section?.id ?? 'unknown',
      concept: question?.conceptId ?? conceptId ?? section?.concepts[0]?.concept.id ?? 'unknown',
      ...(section?.startPage ? { bookPage: section.startPage } : {}),
    }),
    [currentSection, lessonEventContext],
  );

  const nextAttemptNo = useCallback((itemId: string) => {
    const next = (attemptCounts.current.get(itemId) ?? 0) + 1;
    attemptCounts.current.set(itemId, next);
    return next;
  }, []);

  /** Section quick-checks are the unlock gate; mirror that for Drive/Notion projections. */
  const markSectionGateAttempt = useCallback((section: LessonSection | undefined, question?: BankQuestion) => {
    if (!section || gateAttemptedSections.current.has(section.id)) return;
    gateAttemptedSections.current.add(section.id);
    emitLearnEvent(makeEventContext(question, section), {
      type: 'gate_attempt',
      itemId: section.id,
      questionText: section.title ?? section.id,
    });
  }, [makeEventContext]);

  useEffect(() => {
    if (!trackPosition) return;
    void trackPosition({
      chapterId: bank.chapter?.id ?? (bank.chapter?.number != null ? String(bank.chapter.number) : bank.bank_id),
      lessonId: lesson.id,
      sectionId: currentSection?.id,
      contentAnchorId: currentSection ? sectionAnchorId(currentSection.id) : undefined,
      contentVersion: bank.version,
      lastActivity: 'reading',
    });
  }, [bank.bank_id, bank.chapter?.id, bank.chapter?.number, bank.version, currentSection, lesson.id, trackPosition]);

  useEffect(() => {
    const context = lessonEventContext;
    const scopeId = `lesson:${lesson.id}`;
    if (activityTracker) activityTracker.startScope({ id: scopeId, openType: 'lesson_open', closeType: 'lesson_close', context, fields: { itemId: lesson.id, questionText: lesson.title } });
    else emitLearnEvent(context, { type: 'lesson_open', itemId: lesson.id, questionText: lesson.title });
    return () => {
      if (activityTracker) activityTracker.stopScope(scopeId);
      else emitLearnEvent(context, { type: 'lesson_close', itemId: lesson.id, questionText: lesson.title });
    };
  }, [activityTracker, lesson.id, lesson.title, lessonEventContext]);

  useEffect(() => {
    if (summary || !currentSection) return;
    const context = makeEventContext(undefined, currentSection);
    const scopeId = `lesson-section:${lesson.id}:${currentSection.id}`;
    const fields = { itemId: currentSection.id, questionText: currentSection.title || currentSection.concepts.map(entry => entry.concept.title).join(' · ') };
    if (activityTracker) activityTracker.startScope({ id: scopeId, openType: 'section_open', closeType: 'section_close', context, fields });
    else emitLearnEvent(context, { ...fields, type: 'section_open' });
    const pageNote = currentSection.startPage
      ? `${currentSection.startPage}${currentSection.endPage && currentSection.endPage !== currentSection.startPage ? `-${currentSection.endPage}` : ''}`
      : undefined;
    const chunkScopeIds = currentSection.concepts.map(({ concept }) => {
      const chunkContext = makeEventContext(undefined, currentSection, concept.id);
      const chunkScopeId = `lesson-chunk:${lesson.id}:${currentSection.id}:${concept.id}`;
      const chunkFields = { itemId: concept.id, questionText: concept.title, ...(pageNote ? { note: `book pages ${pageNote}` } : {}) };
      if (activityTracker) activityTracker.startScope({ id: chunkScopeId, openType: 'chunk_open', closeType: 'chunk_read', context: chunkContext, fields: chunkFields });
      else emitLearnEvent(chunkContext, { ...chunkFields, type: 'chunk_read' });
      return chunkScopeId;
    });
    return () => {
      for (const chunkScopeId of chunkScopeIds) activityTracker?.stopScope(chunkScopeId);
      if (activityTracker) activityTracker.stopScope(scopeId);
      else emitLearnEvent(context, { ...fields, type: 'section_close' });
      if (focusedCheckScope.current) activityTracker?.stopScope(focusedCheckScope.current);
      if (focusedWorkScope.current) activityTracker?.stopScope(focusedWorkScope.current);
      focusedCheckScope.current = null;
      focusedWorkScope.current = null;
    };
  }, [activityTracker, currentSection, lesson.id, makeEventContext, summary]);

  useEffect(() => () => {
    for (const timer of pendingAnswerEdits.current.values()) clearTimeout(timer);
    for (const timer of pendingWorkEdits.current.values()) clearTimeout(timer);
    pendingAnswerEdits.current.clear();
    pendingWorkEdits.current.clear();
  }, []);

  const engageCheck = useCallback((questionId: string) => {
    if (!activityTracker) return;
    const id = `lesson-check:${lesson.id}:${questionId}`;
    if (focusedCheckScope.current === id) return;
    if (focusedCheckScope.current) activityTracker.stopScope(focusedCheckScope.current);
    if (focusedWorkScope.current) activityTracker.stopScope(focusedWorkScope.current);
    focusedWorkScope.current = null;
    const question = allQuestions.get(questionId);
    if (!question) return;
    focusedCheckScope.current = id;
    activityTracker.startScope({
      id, openType: 'question_open', closeType: 'question_close', context: makeEventContext(question),
      fields: { itemId: question.id, itemType: questionEventItemType(question), questionText: question.prompt || question.source },
    });
  }, [activityTracker, allQuestions, lesson.id, makeEventContext]);

  const leaveCheck = useCallback((questionId: string) => {
    const id = `lesson-check:${lesson.id}:${questionId}`;
    if (focusedCheckScope.current !== id) return;
    activityTracker?.stopScope(id);
    focusedCheckScope.current = null;
  }, [activityTracker, lesson.id]);

  const engageWorkItem = useCallback((item: LessonWorkItem) => {
    if (!activityTracker || item.kind === 'check') return;
    const id = `lesson-work:${lesson.id}:${item.key}`;
    if (focusedWorkScope.current === id) return;
    if (focusedWorkScope.current) activityTracker.stopScope(focusedWorkScope.current);
    if (focusedCheckScope.current) activityTracker.stopScope(focusedCheckScope.current);
    focusedCheckScope.current = null;
    const question = item.kind === 'exercise' ? item.question : undefined;
    focusedWorkScope.current = id;
    activityTracker.startScope({
      id, openType: 'question_open', closeType: 'question_close',
      context: makeEventContext(question, currentSection, item.kind === 'example' || item.kind === 'guided' ? item.conceptId : undefined),
      fields: { itemId: question?.id ?? item.key, itemType: 'step_by_step', questionText: item.title },
    });
  }, [activityTracker, currentSection, lesson.id, makeEventContext]);

  const leaveWorkItem = useCallback((item: LessonWorkItem) => {
    const id = `lesson-work:${lesson.id}:${item.key}`;
    if (focusedWorkScope.current !== id) return;
    activityTracker?.stopScope(id);
    focusedWorkScope.current = null;
  }, [activityTracker, lesson.id]);

  return useMemo(() => ({
    lessonEventContext,
    makeEventContext,
    nextAttemptNo,
    markSectionGateAttempt,
    gateFailedSections,
    pendingAnswerEdits,
    pendingWorkEdits,
    engageCheck,
    leaveCheck,
    engageWorkItem,
    leaveWorkItem,
  }), [
    engageCheck,
    engageWorkItem,
    leaveCheck,
    leaveWorkItem,
    lessonEventContext,
    makeEventContext,
    markSectionGateAttempt,
    nextAttemptNo,
  ]);
}
