import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, BookOpen, ChevronDown } from 'lucide-react';
import { Button } from '../../shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../shared/ui/dialog';
import type { BankQuestion, DriveBank } from '../drive-bank/drive-bank';
import type { Lesson, LessonCheckAnswer, LessonProgress } from './types';
import { getLearnChecks, getPracticeQuestionOrigin, getPracticeQuestions, getSectionLearnChecks, getSectionPracticeQuestions } from './selectors';
import { LessonCheck } from './lesson-check';
import { contentDirection, displayEducationalHeading, isRedundantOpeningHeading, languageForText, lessonUiLanguage, LessonBlockView, LessonSourceAttribution, LessonText, localizeLessonDigits } from './lesson-content';
import { buildLessonSections, type LessonSection } from './lesson-sections';
import { createLessonMathStore } from './lesson-math-check';
import { MathDisplay } from '../../MathDisplay';
import type { ScratchStore } from '../../store';
import { useWorkspaceLayout } from '../../shared/hooks/use-workspace-layout';
import { MAX_SESSION_EXERCISES, stepIsBlank, stepLatex, type Step } from '../../model';
import { buildSectionWorkItems, clampSplitRatio, lessonPaneMode, ratioFromPointer, resolveSelectedWorkItem, SPLIT_MEDIA_QUERY, SPLIT_RATIO_STORAGE_KEY, type LessonWorkItem } from './lesson-work-items';
import { LessonWorkPane } from './lesson-work-pane';
import { ActivityTracker } from '../../sync/activity-tracker';
import { emitLearnEvent, type LearnEventContext, type LearnEventDraft } from '../../sync/events';

function subscribeSplit(change: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const list = window.matchMedia(SPLIT_MEDIA_QUERY);
  list.addEventListener?.('change', change);
  return () => list.removeEventListener?.('change', change);
}
function splitSnapshot() { return typeof window.matchMedia === 'function' && window.matchMedia(SPLIT_MEDIA_QUERY).matches; }
function readSplitRatio() { try { return clampSplitRatio(window.localStorage.getItem(SPLIT_RATIO_STORAGE_KEY) ?? undefined); } catch { return clampSplitRatio(undefined); } }
function writeSplitRatio(value: number) { try { window.localStorage.setItem(SPLIT_RATIO_STORAGE_KEY, String(value)); } catch { /* preference only */ } }

type Props = {
  bank: DriveBank | null;
  lesson: Lesson | null;
  loading?: boolean;
  initialProgress?: LessonProgress;
  onBack: () => void;
  onProgress?: (progress: LessonProgress) => void;
  onStartPractice: (lesson: Lesson, progress: LessonProgress, questions: BankQuestion[], sectionId?: string) => void;
  practiceError?: string;
  progressMessage?: string;
  activityTracker?: ActivityTracker;
  eventContext?: LearnEventContext;
};

type ReadyProps = Props & { bank: DriveBank; lesson: Lesson };

function newProgress(lessonId: string): LessonProgress {
  return { lessonId, status: 'learning', currentConceptIndex: 0, currentSectionIndex: 0, completedConceptIds: [], completedSectionIds: [], answeredCheckIds: [], skippedChecks: [], summaryOpen: false, revealedSteps: {}, learnStartedAt: new Date().toISOString() };
}

function LessonSectionContent({ section, onReveal, revealedSteps, uiLang, hideSingleConceptHeading = false }: {
  section: LessonSection; onReveal: (key: string, value: number) => void; revealedSteps: Record<string, number>; uiLang: 'fa' | 'en'; hideSingleConceptHeading?: boolean;
}) {
  return <div className="lesson-section-content">
    {section.concepts.map(({ concept, conceptIndex, blocks }) => {
      const content = <div className="lesson-concept-blocks">{blocks.map((block, blockIndex) => {
        const originalIndex = concept.blocks.indexOf(block);
        if (isRedundantOpeningHeading(concept, block, originalIndex)) return null;
        const key = `${concept.id}:${originalIndex >= 0 ? originalIndex : blockIndex}`;
        return <LessonBlockView key={key} block={block} blockKey={key} revealed={revealedSteps[key] ?? 0} onReveal={value => onReveal(key, value)} uiLang={uiLang} />;
      })}</div>;
      if (hideSingleConceptHeading && section.concepts.length === 1) return <div className="lesson-section-concept" key={concept.id}>{content}</div>;
      return <section className="lesson-section-concept" key={concept.id} aria-labelledby={`lesson-section-concept-${concept.id}`}>
        <p className="lesson-section-concept-label">{uiLang === 'fa' ? 'مفهوم' : 'Concept'} {localizeLessonDigits(conceptIndex + 1, uiLang)}</p>
        <h3 id={`lesson-section-concept-${concept.id}`} lang={languageForText(concept.title)} dir={contentDirection(concept.title)}><LessonText text={displayEducationalHeading(concept.title)} /></h3>
        {content}
      </section>;
    })}
  </div>;
}

function ReviewQuestionContent({ question }: { question: BankQuestion }) {
  if (question.prompt) return <span lang={languageForText(question.prompt)} dir={contentDirection(question.prompt)}><LessonText text={question.prompt} /></span>;
  if (question.mode === 'math') return <bdi dir="ltr"><MathDisplay latex={question.source} label="Question expression" display={false} /></bdi>;
  return <span lang={languageForText(question.source)} dir={contentDirection(question.source)}><LessonText text={question.source} /></span>;
}

function ReadyLessonScreen({ bank, lesson, initialProgress, onBack, onProgress, onStartPractice, practiceError, progressMessage, activityTracker, eventContext }: ReadyProps) {
  const layout = useWorkspaceLayout(), phone = layout === 'phone';
  const uiLang = lessonUiLanguage(lesson), fa = uiLang === 'fa';
  const sections = useMemo(() => buildLessonSections(lesson), [lesson]);
  const [lessonInfoOpen, setLessonInfoOpen] = useState(false);
  const practiceQuestions = useMemo(() => getPracticeQuestions(bank, lesson.id), [bank, lesson.id]);
  const initialSectionIndex = useMemo(() => {
    const saved = initialProgress?.currentSectionIndex;
    if (Number.isInteger(saved) && saved! >= 0 && saved! < sections.length) return saved!;
    const conceptId = lesson.concepts[initialProgress?.currentConceptIndex ?? 0]?.id;
    const found = sections.findIndex(section => section.concepts.some(entry => entry.concept.id === conceptId));
    return Math.max(0, found);
  }, [initialProgress, lesson.concepts, sections]);
  const [progress, setProgress] = useState<LessonProgress>(() => initialProgress ?? newProgress(lesson.id));
  const progressRef = useRef(progress);
  const [sectionIndex, setSectionIndex] = useState(initialSectionIndex);
  const [summary, setSummary] = useState(initialProgress?.summaryOpen ?? (lesson.concepts.length === 0 || initialProgress?.status === 'done' || (!!initialProgress?.learnDoneAt && lesson.concepts.length > 0 && lesson.concepts.every(concept => initialProgress.completedConceptIds.includes(concept.id)))));
  const [skipQuestion, setSkipQuestion] = useState<BankQuestion | null>(null);
  const [skipPracticeOpen, setSkipPracticeOpen] = useState(false);
  const skipCheckInvoker = useRef<HTMLElement | null>(null);
  const skipPracticeInvoker = useRef<HTMLButtonElement>(null);
  const mathStores = useRef(new Map<string, ScratchStore>());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryHeadingRef = useRef<HTMLHeadingElement>(null);
  const autoStartedLesson = useRef<string | null>(null);
  const paneMode = lessonPaneMode(useSyncExternalStore(subscribeSplit, splitSnapshot, () => false)), split = paneMode === 'split';
  const [splitRatio, setSplitRatio] = useState(readSplitRatio);
  const [paneTab, setPaneTab] = useState<'lesson' | 'work'>('lesson');
  const [selectedWorkKey, setSelectedWorkKey] = useState<string | undefined>();
  const workStores = useRef(new Map<string, ScratchStore>());
  const splitRef = useRef<HTMLDivElement>(null);
  const focusedCheckScope = useRef<string | null>(null);
  const focusedWorkScope = useRef<string | null>(null);
  const attemptCounts = useRef(new Map<string, number>());
  const pendingAnswerEdits = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingWorkEdits = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const commitProgress = useCallback((next: LessonProgress) => {
    progressRef.current = next;
    setProgress(next);
    onProgress?.(next);
  }, [onProgress]);

  const currentSection = sections[sectionIndex];
  const checks = useMemo(() => currentSection ? getSectionLearnChecks(bank, lesson, sections, sectionIndex) : [], [bank, lesson, sections, sectionIndex, currentSection]);
  const sectionPracticeQuestions = useMemo(() => currentSection ? getSectionPracticeQuestions(bank, lesson, sections, sectionIndex) : [], [bank, lesson, sections, sectionIndex, currentSection]);
  const workItems = useMemo(() => buildSectionWorkItems(currentSection, checks, sectionPracticeQuestions), [currentSection, checks, sectionPracticeQuestions]);
  const selectedWorkItem = resolveSelectedWorkItem(workItems, selectedWorkKey);
  const allQuestions = useMemo(() => new Map(bank.questions.map(question => [question.id, question])), [bank.questions]);

  const lessonEventContext = useMemo<LearnEventContext>(() => {
    const sectionNumber = Number(lesson.section.match(/^\s*(\d+)/)?.[1]);
    return {
      ...eventContext,
      bankVersion: eventContext?.bankVersion ?? bank.version ?? 'unknown',
      session: eventContext?.session ?? 'unknown',
      chapter: eventContext?.chapter ?? bank.chapter?.number ?? (Number.isInteger(sectionNumber) ? sectionNumber : 0),
      lesson: lesson.id,
      section: 'unknown',
      concept: 'unknown',
    };
  }, [bank.chapter?.number, bank.version, eventContext, lesson.id, lesson.section]);

  const makeEventContext = useCallback((question?: BankQuestion, section = currentSection, conceptId?: string): LearnEventContext => {
    return {
      ...lessonEventContext,
      section: question?.sectionId ?? section?.id ?? 'unknown',
      concept: question?.conceptId ?? conceptId ?? section?.concepts[0]?.concept.id ?? 'unknown',
      ...(section?.startPage ? { bookPage: section.startPage } : {}),
    };
  }, [currentSection, lessonEventContext]);

  const nextAttemptNo = useCallback((itemId: string) => {
    const next = (attemptCounts.current.get(itemId) ?? 0) + 1;
    attemptCounts.current.set(itemId, next);
    return next;
  }, []);

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

  useEffect(() => {
    const target = (summary ? summaryHeadingRef : headingRef).current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
  }, [sectionIndex, summary]);

  useEffect(() => {
    if (lesson.concepts.length !== 0 || autoStartedLesson.current === lesson.id) return;
    autoStartedLesson.current = lesson.id;
    const now = new Date().toISOString();
    if (practiceQuestions.length === 0) {
      commitProgress({ ...progressRef.current, status: 'done', learnDoneAt: now });
      return;
    }
    const next: LessonProgress = { ...progressRef.current, status: 'practising', learnDoneAt: now, practiceStartedAt: now };
    commitProgress(next);
    onStartPractice(lesson, next, practiceQuestions);
  }, [commitProgress, lesson, onStartPractice, practiceQuestions]);

  const getMathStore = useCallback((question: BankQuestion) => {
    let store = mathStores.current.get(question.id);
    if (!store) {
      const saved = progressRef.current.checkAnswers?.[question.id];
      store = createLessonMathStore(question, phone, saved?.type === 'math' ? saved.steps : undefined);
      mathStores.current.set(question.id, store);
    }
    return store;
  }, [phone]);

  const getWorkStore = useCallback((item: LessonWorkItem) => {
    let store = workStores.current.get(item.key);
    if (!store) {
      store = createLessonMathStore(item.workQuestion, phone, progressRef.current.workAnswers?.[item.key]?.steps);
      workStores.current.set(item.key, store);
    }
    return store;
  }, [phone]);

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
      fields: {
        itemId: question.id,
        itemType: question.answerType === 'choice' ? 'mcq' : question.answerType === 'text' || question.mode === 'text' ? 'typed' : 'step_by_step',
        questionText: question.prompt || question.source,
      },
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
      fields: {
        itemId: question?.id ?? item.key,
        itemType: 'step_by_step',
        questionText: item.title,
      },
    });
  }, [activityTracker, currentSection, lesson.id, makeEventContext]);

  const leaveWorkItem = useCallback((item: LessonWorkItem) => {
    const id = `lesson-work:${lesson.id}:${item.key}`;
    if (focusedWorkScope.current !== id) return;
    activityTracker?.stopScope(id);
    focusedWorkScope.current = null;
  }, [activityTracker, lesson.id]);

  const setWork = useCallback((key: string, { steps }: { type: 'math'; steps: Step[] }) => {
    const before = progressRef.current;
    const workAnswers = { ...before.workAnswers };
    const previous = workAnswers[key];
    const blank = steps.every(step => stepIsBlank(step));
    if (blank && !previous) return;
    const signature = JSON.stringify(steps.map(step => stepLatex(step)));
    if (previous && JSON.stringify(previous.steps.map(step => stepLatex(step))) === signature) return;
    if (blank) delete workAnswers[key];
    else workAnswers[key] = { type: 'math', steps };
    commitProgress({ ...before, workAnswers: Object.keys(workAnswers).length ? workAnswers : undefined });
    const item = workItems.find(candidate => candidate.key === key);
    if (!item || blank) return;
    const eventSteps = steps.map(step => stepLatex(step).slice(0, 4_000)).slice(0, 40);
    const questionText = (item.kind === 'check' || item.kind === 'exercise') ? (item.question.prompt || item.question.source) : item.title;
    const itemId = item.kind === 'check' || item.kind === 'exercise' ? item.question.id : item.key;
    const context = makeEventContext(item.kind === 'check' || item.kind === 'exercise' ? item.question : undefined, currentSection, item.kind === 'example' || item.kind === 'guided' ? item.conceptId : undefined);
    if (!previous) {
      const type = item.kind === 'example' || item.kind === 'guided' ? 'example_attempt' : item.kind === 'exercise' ? 'exercise_attempt' : 'check_answer';
      emitLearnEvent(context, {
        type, itemId, itemType: 'step_by_step', questionText, userAnswer: eventSteps.join('\n').slice(0, 8_000), steps: eventSteps,
        verdict: 'submitted', verdictSource: 'none', attemptNo: nextAttemptNo(itemId),
      });
    } else {
      const timer = pendingWorkEdits.current.get(key);
      if (timer) clearTimeout(timer);
      const nextTimer = setTimeout(() => {
        pendingWorkEdits.current.delete(key);
        const latest = progressRef.current.workAnswers?.[key]?.steps;
        if (!latest) return;
        const latestSteps = latest.map(step => stepLatex(step).slice(0, 4_000)).slice(0, 40);
        emitLearnEvent(context, { type: 'step_edited', itemId, itemType: 'step_by_step', questionText, userAnswer: latestSteps.join('\n').slice(0, 8_000), steps: latestSteps });
      }, 700);
      pendingWorkEdits.current.set(key, nextTimer);
    }
    if (previous && steps.length > previous.steps.length) {
      for (const added of steps.slice(previous.steps.length)) emitLearnEvent(context, { type: 'step_added', itemId: added.id, itemType: 'step_by_step', questionText, steps: eventSteps });
    }
  }, [commitProgress, currentSection, makeEventContext, nextAttemptNo, workItems]);

  const updateSplitRatio = useCallback((value: number) => { const next = clampSplitRatio(value); setSplitRatio(next); writeSplitRatio(next); }, []);
  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    const container = splitRef.current;
    if (!container) return;
    event.preventDefault();
    const rtl = getComputedStyle(container).direction === 'rtl';
    const move = (e: PointerEvent) => updateSplitRatio(ratioFromPointer(e.clientX, container.getBoundingClientRect(), rtl));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  function resizeByKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    const rtl = splitRef.current ? getComputedStyle(splitRef.current).direction === 'rtl' : fa;
    const grow = rtl ? 'ArrowLeft' : 'ArrowRight', shrink = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === grow) { event.preventDefault(); updateSplitRatio(splitRatio + 5); }
    else if (event.key === shrink) { event.preventDefault(); updateSplitRatio(splitRatio - 5); }
    else if (event.key === 'Home') { event.preventDefault(); updateSplitRatio(30); }
    else if (event.key === 'End') { event.preventDefault(); updateSplitRatio(70); }
  }

  const isCheckComplete = useCallback((questionId: string) => progress.answeredCheckIds.includes(questionId) || progress.skippedChecks.some(item => item.questionId === questionId), [progress.answeredCheckIds, progress.skippedChecks]);
  const conceptComplete = checks.every(question => isCheckComplete(question.id));

  const setAnswer = useCallback((questionId: string, value: LessonCheckAnswer | null) => {
    const answered = value === null ? false : value.type === 'math'
      ? value.steps.some(step => !stepIsBlank(step))
      : !!value.value.trim();
    const before = progressRef.current;
    const question = allQuestions.get(questionId);
    const previousAnswer = before.checkAnswers?.[questionId];
    const currentSignature = JSON.stringify(value);
    const previousSignature = JSON.stringify(previousAnswer);
    const checkAnswers = { ...before.checkAnswers };
    if (value) checkAnswers[questionId] = value;
    else delete checkAnswers[questionId];
    const answeredCheckIds = answered
      ? [...new Set([...before.answeredCheckIds, questionId])]
      : before.answeredCheckIds.filter(id => id !== questionId);
    const skippedChecks = answered ? before.skippedChecks.filter(item => item.questionId !== questionId) : before.skippedChecks;
    commitProgress({ ...before, answeredCheckIds, skippedChecks, ...(Object.keys(checkAnswers).length ? { checkAnswers } : { checkAnswers: undefined }) });
    if (!question || currentSignature === previousSignature) return;
    const context = makeEventContext(question);
    const steps = value?.type === 'math' ? value.steps.map(step => stepLatex(step).slice(0, 4_000)).slice(0, 40) : undefined;
    const answerText = value?.type === 'math' ? steps?.join('\n') ?? '' : value?.value ?? '';
    const baseFields = {
      itemId: question.id,
      itemType: question.answerType === 'choice' ? 'mcq' as const : question.answerType === 'text' || question.mode === 'text' ? 'typed' as const : 'step_by_step' as const,
      questionText: (question.prompt || question.source).slice(0, 8_000),
      userAnswer: answerText.slice(0, 8_000),
      ...(steps ? { steps } : {}),
      verdict: 'submitted' as const,
      verdictSource: 'none' as const,
    };
    if (answered && !before.answeredCheckIds.includes(questionId)) {
      const attemptNo = nextAttemptNo(questionId);
      emitLearnEvent(context, { ...baseFields, type: 'check_answer', attemptNo });
    } else {
      const existing = pendingAnswerEdits.current.get(questionId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        pendingAnswerEdits.current.delete(questionId);
        emitLearnEvent(context, { ...baseFields, type: 'answer_edited', ...(answered ? {} : { note: 'Response cleared.' }) });
      }, 700);
      pendingAnswerEdits.current.set(questionId, timer);
    }
  }, [allQuestions, commitProgress, makeEventContext, nextAttemptNo]);

  const setConfidence = useCallback((questionId: string, value: 1 | 2 | 3 | 4 | 5) => {
    const before = progressRef.current;
    commitProgress({ ...before, confidenceByCheckId: { ...before.confidenceByCheckId, [questionId]: value } });
    const question = allQuestions.get(questionId);
    if (question) emitLearnEvent(makeEventContext(question), { type: 'confidence_set', itemId: question.id, confidence: value, questionText: (question.prompt || question.source).slice(0, 8_000) });
  }, [allQuestions, commitProgress, makeEventContext]);

  function confirmSkip() {
    if (!skipQuestion) return;
    const before = progressRef.current;
    const skippedChecks = before.skippedChecks.some(item => item.questionId === skipQuestion.id)
      ? before.skippedChecks
      : [...before.skippedChecks, { questionId: skipQuestion.id, at: new Date().toISOString() }];
    commitProgress({ ...before, skippedChecks });
    emitLearnEvent(makeEventContext(skipQuestion), {
      type: 'check_skipped', itemId: skipQuestion.id,
      itemType: skipQuestion.answerType === 'choice' ? 'mcq' : skipQuestion.answerType === 'text' || skipQuestion.mode === 'text' ? 'typed' : 'step_by_step',
      questionText: (skipQuestion.prompt || skipQuestion.source).slice(0, 8_000),
    });
    setSkipQuestion(null);
  }

  function revealStep(key: string, value: number) {
    const before = progressRef.current;
    commitProgress({ ...before, revealedSteps: { ...before.revealedSteps, [key]: value } });
    if (value > (before.revealedSteps[key] ?? 0)) {
      const [conceptId, blockIndexText] = key.split(':');
      const concept = currentSection?.concepts.find(entry => entry.concept.id === conceptId)?.concept;
      const block = concept?.blocks[Number(blockIndexText)];
      emitLearnEvent(makeEventContext(undefined, currentSection, conceptId), {
        type: block?.type === 'example' ? 'example_revealed' : 'content_revealed',
        itemId: key,
        ...(block?.type === 'example' ? { questionText: [block.title, block.text, block.latex].filter(Boolean).join('\n').slice(0, 8_000) } : {}),
      });
    }
  }

  const goPrevious = useCallback(() => {
    const nextIndex = summary ? Math.max(0, sections.length - 1) : Math.max(0, sectionIndex - 1);
    if (!summary && sectionIndex === 0) return;
    const before = progressRef.current;
    const nextSection = sections[nextIndex];
    const conceptIndex = nextSection?.concepts[0]?.conceptIndex ?? 0;
    if (before.currentSectionIndex !== nextIndex || before.currentConceptIndex !== conceptIndex || before.summaryOpen !== false) {
      commitProgress({ ...before, currentSectionIndex: nextIndex, currentConceptIndex: conceptIndex, summaryOpen: false });
    }
    setSummary(false);
    setSectionIndex(nextIndex);
  }, [commitProgress, sectionIndex, sections, summary]);

  const goNext = useCallback(() => {
    if (!currentSection || !conceptComplete) return;
    const before = progressRef.current;
    const completedConceptIds = new Set(before.completedConceptIds);
    for (const { concept } of currentSection.concepts) {
      const lastAppearance = sections.map(section => section.concepts.some(entry => entry.concept.id === concept.id)).lastIndexOf(true);
      if (lastAppearance !== sectionIndex) continue;
      const allChecksComplete = getLearnChecks(bank, concept.id).every(question => isCheckComplete(question.id));
      if (allChecksComplete && !completedConceptIds.has(concept.id)) {
        completedConceptIds.add(concept.id);
        emitLearnEvent(makeEventContext(undefined, currentSection, concept.id), { type: 'concept_complete', itemId: concept.id, questionText: concept.title });
      }
    }
    emitLearnEvent(makeEventContext(undefined, currentSection), { type: 'section_complete', itemId: currentSection.id, questionText: currentSection.title ?? '' });
    const nextIndex = sectionIndex + 1;
    const nextSection = sections[nextIndex];
    if (nextSection) {
      const conceptIndex = nextSection.concepts[0]?.conceptIndex ?? 0;
      commitProgress({ ...before, currentConceptIndex: conceptIndex, currentSectionIndex: nextIndex, completedConceptIds: [...completedConceptIds], summaryOpen: false });
      setSectionIndex(nextIndex);
      return;
    }
    const noPractice = practiceQuestions.length === 0;
    emitLearnEvent(lessonEventContext, { type: 'lesson_complete', itemId: lesson.id, questionText: lesson.title });
    commitProgress({ ...before, currentConceptIndex: currentSection.concepts.at(-1)?.conceptIndex ?? before.currentConceptIndex, currentSectionIndex: sectionIndex, completedConceptIds: [...completedConceptIds], status: noPractice ? 'done' : 'learning', summaryOpen: true, learnDoneAt: new Date().toISOString() });
    setSummary(true);
  }, [bank, commitProgress, conceptComplete, currentSection, isCheckComplete, lessonEventContext, lesson.id, lesson.title, makeEventContext, practiceQuestions.length, sectionIndex, sections]);

  function startSectionPractice() {
    if (!currentSection || !sectionPracticeQuestions.length) return;
    const before = progressRef.current;
    const now = new Date().toISOString();
    const next: LessonProgress = {
      ...before,
      status: 'practising',
      currentSectionIndex: sectionIndex,
      currentConceptIndex: currentSection.concepts[0]?.conceptIndex ?? before.currentConceptIndex,
      activePracticeSectionId: currentSection.id,
      activePracticeQuestionIds: undefined,
      summaryOpen: false,
      practiceStartedAt: now,
    };
    commitProgress(next);
    emitLearnEvent(makeEventContext(undefined, currentSection), { type: 'practice_started', itemId: currentSection.id, note: `${sectionPracticeQuestions.length} section questions` });
    onStartPractice(lesson, next, sectionPracticeQuestions, currentSection.id);
  }

  function confirmSkipToPractice() {
    if (!skipPracticeOpen || !remainingPracticeQuestions.length) return;
    startWholeLessonPractice(true);
  }

  function reviewLesson() {
    const before = progressRef.current;
    if (before.currentConceptIndex !== 0 || before.currentSectionIndex !== 0 || before.summaryOpen !== false) commitProgress({ ...before, currentConceptIndex: 0, currentSectionIndex: 0, summaryOpen: false });
    setSummary(false);
    setSectionIndex(0);
  }

  useEffect(() => {
    function handleConceptShortcut(event: globalThis.KeyboardEvent) {
      if (!(event.altKey && (event.ctrlKey || event.metaKey))) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"], .lesson-math-editor')) return;
      if (event.key === 'ArrowLeft' && (summary || sectionIndex > 0)) {
        event.preventDefault();
        goPrevious();
      } else if (event.key === 'ArrowRight' && !summary && currentSection && conceptComplete) {
        event.preventDefault();
        goNext();
      }
    }
    window.addEventListener('keydown', handleConceptShortcut);
    return () => window.removeEventListener('keydown', handleConceptShortcut);
  }, [conceptComplete, currentSection, goNext, goPrevious, sectionIndex, summary]);

  const pages = lesson.pages ? lesson.pages.replace(/(\d)\s*-\s*(\d)/, '$1–$2') : '';
  const currentSectionPages = currentSection?.startPage
    ? currentSection.startPage === currentSection.endPage
      ? localizeLessonDigits(currentSection.startPage)
      : `${localizeLessonDigits(currentSection.startPage)}–${localizeLessonDigits(currentSection.endPage ?? currentSection.startPage + 1)}`
    : '';
  const sectionBookQuestions = sectionPracticeQuestions.filter(question => getPracticeQuestionOrigin(question, lesson.id) === 'textbook').length;
  const sectionGeneratedQuestions = sectionPracticeQuestions.filter(question => getPracticeQuestionOrigin(question, lesson.id) === 'generated').length;
  const wholeBookQuestions = practiceQuestions.filter(question => getPracticeQuestionOrigin(question, lesson.id) === 'textbook').length;
  const wholeGeneratedQuestions = practiceQuestions.filter(question => getPracticeQuestionOrigin(question, lesson.id) === 'generated').length;
  const completedPracticeIds = new Set(progress.completedPracticeQuestionIds ?? []);
  const remainingPracticeQuestions = practiceQuestions.filter(question => !completedPracticeIds.has(question.id));
  const practiceBatch = remainingPracticeQuestions.slice(0, MAX_SESSION_EXERCISES);
  const practiceBatchCount = Math.ceil(practiceQuestions.length / MAX_SESSION_EXERCISES);
  const sectionQuestionWord = sectionPracticeQuestions.length === 1 ? (fa ? 'سؤال' : 'question') : (fa ? 'سؤال' : 'questions');

  function selectWorkItem(key: string) {
    setSelectedWorkKey(key);
    const item = workItems.find(candidate => candidate.key === key);
    if (!item) return;
    if (item.kind === 'check') engageCheck(item.question.id);
    else engageWorkItem(item);
  }

  function revealWorkSolution(item: LessonWorkItem) {
    if (item.kind !== 'example') return;
    const fullText = [item.title, item.block.type === 'example' ? item.block.text : '', item.block.type === 'example' ? item.block.latex : ''].filter(Boolean).join('\n');
    emitLearnEvent(makeEventContext(undefined, currentSection, item.conceptId), { type: 'example_revealed', itemId: item.key, itemType: 'step_by_step', questionText: fullText.slice(0, 8_000), note: 'Learner requested comparison after writing work.' });
  }

  const renderCheck = (question: BankQuestion) => <LessonCheck key={question.id} question={question}
          uiLang={uiLang}
          mathStore={question.answerType === 'math' || (!question.answerType && question.mode === 'math') ? getMathStore(question) : undefined}
          answer={progress.checkAnswers?.[question.id]} answered={progress.answeredCheckIds.includes(question.id)} confidence={progress.confidenceByCheckId?.[question.id]}
          skipped={progress.skippedChecks.some(item => item.questionId === question.id)}
          onAnswer={setAnswer} onConfidence={setConfidence} onSkip={questionId => { skipCheckInvoker.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setSkipQuestion(allQuestions.get(questionId) ?? null); }}
          onEngage={engageCheck} onLeave={leaveCheck} />;

  function startWholeLessonPractice(skipLearn = false) {
    if (!practiceBatch.length) return;
    const before = progressRef.current;
    const now = new Date().toISOString();
    const next: LessonProgress = {
      ...before,
      status: 'practising',
      activePracticeSectionId: undefined,
      activePracticeQuestionIds: practiceBatch.map(question => question.id),
      summaryOpen: !skipLearn,
      learnDoneAt: before.learnDoneAt ?? now,
      ...(skipLearn ? { learnSkipped: { at: now } } : {}),
      practiceStartedAt: now,
    };
    commitProgress(next);
    if (skipLearn) emitLearnEvent(lessonEventContext, { type: 'lesson_skip', itemId: lesson.id, questionText: lesson.title, note: 'Learner chose to skip lesson checks and start practice.' });
    emitLearnEvent(lessonEventContext, { type: 'practice_started', itemId: lesson.id, note: `${practiceBatch.length} end-of-lesson questions` });
    if (skipLearn) setSkipPracticeOpen(false);
    onStartPractice(lesson, next, practiceBatch);
  }
  return <section className="lesson-screen" aria-label={fa ? 'درس‌نامه' : 'Lesson notes'} lang={uiLang} dir={fa ? 'rtl' : 'ltr'}>
    <header className="lesson-header">
      <Button variant="ghost" className="lesson-back" onClick={onBack}><ArrowLeft aria-hidden="true" />{fa ? 'بازگشت به تمرین' : 'Back to question'}</Button>
      <Button variant="ghost" className="lesson-info-toggle" aria-expanded={lessonInfoOpen} aria-controls="lesson-info-panel" onClick={() => setLessonInfoOpen(open => !open)}>
        <span>{fa ? (lessonInfoOpen ? 'بستن اطلاعات درس' : 'اطلاعات درس') : (lessonInfoOpen ? 'Hide lesson information' : 'Lesson information')}</span>
        <ChevronDown aria-hidden="true" className={lessonInfoOpen ? 'lesson-info-chevron lesson-info-chevron-open' : 'lesson-info-chevron'} />
      </Button>
      <div id="lesson-info-panel" className={`lesson-info-panel${lessonInfoOpen ? '' : ' lesson-info-panel-collapsed'}`}>
        <p className="lesson-book-line" dir="ltr"><bdi>{lesson.book}</bdi> · {lesson.section}{pages && <> · <bdi>pp. {pages}</bdi></>}</p>
        <LessonSourceAttribution book={lesson.book} section={lesson.section} />
      </div>
      <h1 lang={languageForText(lesson.title)} dir={contentDirection(lesson.title)}><LessonText text={displayEducationalHeading(lesson.title)} /></h1>
      {summary && <p className="lesson-progress" aria-live="polite">{fa ? 'جمع‌بندی درس' : 'Lesson summary'}</p>}
      {practiceError && <p className="lesson-practice-error" role="alert">{practiceError}</p>}
      {progressMessage && <p className="lesson-progress-message" role="alert">{progressMessage}</p>}
    </header>

    {summary ? <section className="lesson-summary" aria-labelledby="lesson-summary-title">
      <div className="lesson-summary-heading"><BookOpen aria-hidden="true" /><h2 id="lesson-summary-title" ref={summaryHeadingRef} tabIndex={-1}>{fa ? 'جمع‌بندی درس' : 'Lesson summary'}</h2></div>
      <ul className="lesson-summary-concepts">{lesson.concepts.map((concept, index) => <li key={concept.id}>
        <span><span>{localizeLessonDigits(index + 1, uiLang)}. </span><bdi lang={languageForText(concept.title)} dir={contentDirection(concept.title)}><LessonText text={displayEducationalHeading(concept.title)} /></bdi></span>
        <span className="lesson-summary-count">{localizeLessonDigits(getLearnChecks(bank, concept.id).filter(question => progress.answeredCheckIds.includes(question.id)).length, uiLang)} {fa ? 'از' : 'of'} {localizeLessonDigits(getLearnChecks(bank, concept.id).length, uiLang)} {fa ? 'تمرین پاسخ داده شد' : 'checks answered'}</span>
      </li>)}</ul>
      {lesson.concepts.some(concept => getLearnChecks(bank, concept.id).some(question => progress.answeredCheckIds.includes(question.id) && progress.confidenceByCheckId?.[question.id] === 1)) && <section className="lesson-summary-review" aria-label={fa ? 'تمرین‌های نیازمند مرور' : 'Checks to review'}>
        <h3>{fa ? 'مرور دوباره' : 'Review again'}</h3><ul>{lesson.concepts.flatMap(concept => getLearnChecks(bank, concept.id).filter(question => progress.answeredCheckIds.includes(question.id) && progress.confidenceByCheckId?.[question.id] === 1).map(question => <li key={question.id}><bdi dir="ltr">{question.id}</bdi> · <ReviewQuestionContent question={question} /></li>))}</ul>
      </section>}
      {progress.skippedChecks.length > 0 && <section className="lesson-summary-skipped" aria-label={fa ? 'تمرین‌های ردشده' : 'Skipped checks'}>
        <h3>{fa ? 'تمرین‌های ردشده' : 'Skipped checks'}</h3><ul>{progress.skippedChecks.map(item => <li key={item.questionId}><bdi dir="ltr">{item.questionId}</bdi></li>)}</ul>
      </section>}
      {practiceQuestions.length === 0 ? <p className="lesson-no-practice">{fa ? 'هنوز تمرینی ثبت نشده است.' : 'No practice questions yet.'}</p> : <section className="lesson-section-practice">
        <h3>{fa ? 'تمرین پایانی درس' : 'End-of-lesson practice'}</h3>
        <p>{fa ? <>{localizeLessonDigits(practiceQuestions.length, uiLang)} سؤال در دسترس است؛ ابتدا {localizeLessonDigits(wholeBookQuestions, uiLang)} سؤال کتاب و سپس {localizeLessonDigits(wholeGeneratedQuestions, uiLang)} تمرین تکمیلی نمایش داده می‌شود.{practiceBatchCount > 1 && <> هر جلسه حداکثر {localizeLessonDigits(MAX_SESSION_EXERCISES, uiLang)} سؤال دارد؛ پس از هر جلسه می‌توانی ادامه بدهی.</>}</> : <>{practiceQuestions.length} questions: {wholeBookQuestions} textbook exercises, followed by {wholeGeneratedQuestions} extra practice questions.{practiceBatchCount > 1 && ` Each session holds up to ${MAX_SESSION_EXERCISES} questions; continue after each batch.`}</>}</p>
        {remainingPracticeQuestions.length > 0 && <Button className="lesson-primary-action" onClick={() => startWholeLessonPractice()}>{fa ? (completedPracticeIds.size ? `ادامهٔ تمرین پایانی · ${localizeLessonDigits(remainingPracticeQuestions.length, uiLang)} سؤال` : 'شروع تمرین پایانی') : (completedPracticeIds.size ? `Continue end-of-lesson practice · ${remainingPracticeQuestions.length} questions` : 'Start practice')}</Button>}
        {remainingPracticeQuestions.length === 0 && <p className="lesson-section-practice-done" role="status">{fa ? 'همهٔ سؤال‌های تمرین پایانی انجام شده‌اند.' : 'All end-of-lesson practice questions are complete.'}</p>}
      </section>}
      <Button className="lesson-review-action" onClick={reviewLesson}>{fa ? 'مرور دوبارهٔ درس' : 'Review lesson'}</Button>
    </section> : currentSection ? <>
      {!split && <div className="lesson-pane-tabs" role="tablist" aria-label={fa ? 'درس‌نامه یا کار من' : 'Lesson or your work'}>
        <button type="button" role="tab" id="lesson-tab-lesson" aria-controls="lesson-panel-lesson" aria-selected={paneTab === 'lesson'} className="lesson-pane-tab" onClick={() => setPaneTab('lesson')}>{fa ? 'درس‌نامه' : 'Lesson'}</button>
        <button type="button" role="tab" id="lesson-tab-work" aria-controls="lesson-panel-work" aria-selected={paneTab === 'work'} className="lesson-pane-tab" onClick={() => setPaneTab('work')}>{fa ? 'کار من' : 'Your work'}{workItems.length ? ` · ${localizeLessonDigits(workItems.length, uiLang)}` : ''}</button>
      </div>}
      <div ref={splitRef} className={`lesson-split ${split ? 'lesson-split-wide' : 'lesson-split-tabs'}`} data-pane-mode={paneMode} style={split ? { ['--lesson-split' as string]: `${splitRatio}%` } : undefined}>
      {(split || paneTab === 'lesson') && <div className="lesson-split-lesson" id="lesson-panel-lesson" {...(split ? {} : { role: 'tabpanel', 'aria-labelledby': 'lesson-tab-lesson' })}>
      <section className="lesson-concept" aria-labelledby="lesson-concept-title">
        <div className="lesson-concept-heading" aria-live="polite"><p className="lesson-section-label">{fa ? 'بخش' : 'Section'} {localizeLessonDigits(sectionIndex + 1, uiLang)} {fa ? 'از' : 'of'} {localizeLessonDigits(sections.length, uiLang)}</p>{currentSectionPages && <span className="lesson-pages">{fa ? 'صفحه‌های' : 'Pages'} {currentSectionPages}</span>}</div>
        <h2 id="lesson-concept-title" ref={headingRef} tabIndex={-1} lang={currentSection.title ? languageForText(currentSection.title) : currentSection.concepts.length === 1 ? languageForText(currentSection.concepts[0].concept.title) : uiLang} dir={currentSection.title ? contentDirection(currentSection.title) : currentSection.concepts.length === 1 ? contentDirection(currentSection.concepts[0].concept.title) : fa ? 'rtl' : 'ltr'}>{currentSection.title ? <LessonText text={displayEducationalHeading(currentSection.title)} /> : currentSection.concepts.length === 1 ? <LessonText text={displayEducationalHeading(currentSection.concepts[0].concept.title)} /> : fa ? 'درس این بخش' : 'This section'}</h2>
        <LessonSectionContent section={currentSection} revealedSteps={progress.revealedSteps} onReveal={revealStep} uiLang={uiLang} hideSingleConceptHeading={!currentSection.title && currentSection.concepts.length === 1} />
      </section>
      <section className="lesson-section-practice" aria-label={fa ? 'تمرین‌های همین بخش' : 'Practice for this section'}>
        <h2>{fa ? 'تمرین‌های همین بخش' : 'Practice for this section'}</h2>
        {sectionPracticeQuestions.length > 0 ? <>
          <p>{fa ? <>{localizeLessonDigits(sectionPracticeQuestions.length, uiLang)} سؤال: {localizeLessonDigits(sectionBookQuestions, uiLang)} تمرین کتاب و {localizeLessonDigits(sectionGeneratedQuestions, uiLang)} تمرین تکمیلی. ابتدا تمرین‌های کتاب آمده‌اند.</> : <>{sectionPracticeQuestions.length} questions: {sectionBookQuestions} textbook and {sectionGeneratedQuestions} extra. Textbook questions come first.</>}</p>
          {progress.completedSectionIds?.includes(currentSection.id) && <p className="lesson-section-practice-done" role="status">{fa ? 'تمرین‌های این بخش انجام شده‌اند.' : 'This section’s practice is complete.'}</p>}
          <Button className="lesson-section-practice-button" onClick={startSectionPractice}>{fa ? 'شروع تمرین این بخش' : 'Practice this section'} · {localizeLessonDigits(sectionPracticeQuestions.length, uiLang)} {sectionQuestionWord}</Button>
        </> : <p>{fa ? 'برای این بخش تمرین جداگانه‌ای ثبت نشده است.' : 'No practice questions are assigned to this section.'}</p>}
      </section>
      {checks.length > 0 && <section className="lesson-checks" aria-label={fa ? 'تمرین کوتاه همین بخش' : 'Quick checks for this section'}>
        <h2>{fa ? 'تمرین کوتاه همین بخش' : 'Quick checks for this section'}</h2>
        {split
          ? <ul className="lesson-check-links">{checks.map(question => <li key={question.id}>
              <Button variant="ghost" className="lesson-check-link" aria-current={selectedWorkItem?.key === `q:${question.id}` ? 'true' : undefined} onClick={() => setSelectedWorkKey(`q:${question.id}`)}>
                <bdi dir="ltr">{question.id}</bdi> · <span lang={languageForText(question.prompt || question.source)} dir={contentDirection(question.prompt || question.source)}><LessonText text={question.prompt || question.source} /></span>
                <span className="lesson-check-link-status">{progress.answeredCheckIds.includes(question.id) ? (fa ? 'پاسخ داده شد' : 'Answered') : progress.skippedChecks.some(item => item.questionId === question.id) ? (fa ? 'ردشده' : 'Skipped') : (fa ? 'حل در «کار من»' : 'Solve in Your work')}</span>
              </Button>
            </li>)}</ul>
          : checks.map(renderCheck)}
      </section>}
      <nav className="lesson-concept-navigation" aria-label={fa ? 'پیمایش بخش‌های درس' : 'Lesson section navigation'}>
        <Button onClick={goPrevious} disabled={sectionIndex === 0}>{fa ? '→ بخش قبلی' : '← Previous section'}</Button>
        <Button className="lesson-primary-action" onClick={goNext} disabled={!conceptComplete}>{fa ? 'بخش بعدی ←' : 'Next section →'}</Button>
      </nav>
      {practiceQuestions.length > 0 && <Button ref={skipPracticeInvoker} className="lesson-skip-practice" variant="ghost" onClick={() => setSkipPracticeOpen(true)}>{fa ? 'رفتن به تمرین پایانی کل درس' : 'Skip to practice'}</Button>}
      </div>}
      {split && <div className="lesson-split-handle" role="separator" tabIndex={0} aria-orientation="vertical" aria-label={fa ? 'تغییر عرض درس‌نامه' : 'Resize lesson panel'} aria-valuemin={30} aria-valuemax={70} aria-valuenow={splitRatio} onPointerDown={startResize} onKeyDown={resizeByKey} onDoubleClick={() => updateSplitRatio(50)} />}
      {(split || paneTab === 'work') && <div className="lesson-split-work" id="lesson-panel-work" {...(split ? {} : { role: 'tabpanel', 'aria-labelledby': 'lesson-tab-work' })}>
        <LessonWorkPane items={workItems} selected={selectedWorkItem} onSelect={selectWorkItem} uiLang={uiLang} getWorkStore={getWorkStore} onWork={setWork} renderCheck={renderCheck} savedSteps={key => progress.workAnswers?.[key]?.steps} onFocusItem={engageWorkItem} onBlurItem={leaveWorkItem} onRevealSolution={revealWorkSolution} />
      </div>}
      </div>
    </> : null}

    <Dialog open={!!skipQuestion} onOpenChange={open => { if (!open) setSkipQuestion(null); }}>
      <DialogContent aria-describedby="lesson-skip-description" onCloseAutoFocus={event => { event.preventDefault(); requestAnimationFrame(() => { const target = skipCheckInvoker.current; if (target?.isConnected) target.focus({ preventScroll: true }); else headingRef.current?.focus({ preventScroll: true }); }); }}>
        <DialogTitle>{fa ? 'از این تمرین بگذرم؟' : 'Skip this check?'}</DialogTitle>
        <DialogDescription id="lesson-skip-description">{fa ? 'این تمرین به‌عنوان ردشده ثبت می‌شود.' : 'This check will be logged as skipped.'}</DialogDescription>
        <div className="dialog-actions"><Button onClick={() => setSkipQuestion(null)}>{fa ? 'انصراف' : 'Cancel'}</Button><Button variant="default" className="lesson-primary-action" onClick={confirmSkip}>{fa ? 'رد کردن تمرین' : 'Skip check'}</Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={skipPracticeOpen} onOpenChange={setSkipPracticeOpen}>
      <DialogContent aria-describedby="lesson-skip-practice-description" onCloseAutoFocus={event => { event.preventDefault(); requestAnimationFrame(() => { const target = skipPracticeInvoker.current; if (target?.isConnected) target.focus({ preventScroll: true }); else headingRef.current?.focus({ preventScroll: true }); }); }}>
        <DialogTitle>{fa ? 'از درس‌نامه به تمرین پایانی بروم؟' : 'Skip to practice?'}</DialogTitle>
        <DialogDescription id="lesson-skip-practice-description">{fa ? 'این انتخاب برای این درس ثبت می‌شود.' : 'This choice will be recorded for this lesson.'}</DialogDescription>
        <div className="dialog-actions"><Button onClick={() => setSkipPracticeOpen(false)}>{fa ? 'ادامهٔ درس‌نامه' : 'Cancel'}</Button><Button variant="default" className="lesson-primary-action" onClick={confirmSkipToPractice}>{fa ? 'رفتن به تمرین پایانی' : 'Skip to practice'}</Button></div>
      </DialogContent>
    </Dialog>
  </section>;
}

function LessonAvailability({ loading, onBack }: { loading: boolean; onBack: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); }, [loading]);
  return <section className={`lesson-state ${loading ? 'lesson-state-loading' : 'lesson-state-error'}`} aria-labelledby="lesson-state-title" aria-busy={loading}>
    {loading ? <>
      <p className="lesson-section-label">Lessons</p>
      <h1 id="lesson-state-title" ref={titleRef} tabIndex={-1}>Loading lesson…</h1>
      <div className="lesson-skeleton" aria-hidden="true"><span /><span /><span /></div>
      <p role="status" aria-live="polite">Loading lesson…</p>
    </> : <>
      <p className="lesson-section-label">Lessons</p>
      <h1 id="lesson-state-title" ref={titleRef} tabIndex={-1}>Lesson unavailable</h1>
      <p role="alert">This lesson data is unavailable. You can continue with the questions.</p>
      <Button onClick={onBack}>Back to question</Button>
    </>}
  </section>;
}

/** Handles the brief unavailable/loading states around the synchronously parsed bank content. */
export function LessonScreen(props: Props) {
  if (props.loading || !props.bank || !props.lesson) {
    return <LessonAvailability loading={!!props.loading} onBack={props.onBack} />;
  }
  return <ReadyLessonScreen {...props as ReadyProps} />;
}
