import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, BookOpen, ChevronDown } from 'lucide-react';
import { Button } from '../../shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../shared/ui/dialog';
import type { BankQuestion, DriveBank } from '../drive-bank/drive-bank';
import type { Lesson, LessonCheckAnswer, LessonProgress } from './types';
import { getLearnChecks, getPracticeQuestionConceptId, getPracticeQuestionOrigin, getPracticeQuestions, getSectionLearnChecks, getSectionPracticeQuestions } from './selectors';
import { LessonCheck } from './lesson-check';
import { LessonChunkChecks } from './lesson-chunk-checks';
import { contentDirection, displayEducationalHeading, isRedundantOpeningHeading, languageForText, lessonUiLanguage, LessonBlockView, LessonSourceAttribution, LessonText, localizeLessonDigits, QuestionSource } from './lesson-content';
import { buildActiveLessonChunks, buildLessonSections, type ActiveLessonChunk, type LessonSection } from './lesson-sections';
import { createLessonMathStore } from './lesson-math-check';
import { MathDisplay } from '../../MathDisplay';
import type { ScratchStore } from '../../store';
import { useWorkspaceLayout } from '../../shared/hooks/use-workspace-layout';
import { MAX_SESSION_EXERCISES, stepIsBlank, type Step } from '../../model';
import { buildConceptWorkItems, buildSectionWorkItems, clampSplitRatio, lessonPaneMode, ratioFromPointer, resolveSelectedWorkItem, SPLIT_MEDIA_QUERY, SPLIT_RATIO_STORAGE_KEY, type LessonWorkItem } from './lesson-work-items';
import { LessonWorkPane } from './lesson-work-pane';
import type { LessonExampleAttempt } from './types';
import { nextTextbookPracticeBatch } from './lesson-practice-batches';

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
  onStartPractice: (lesson: Lesson, progress: LessonProgress, questions: BankQuestion[], sectionId?: string, conceptId?: string) => void;
  onDownloadLesson?: (format: 'md' | 'json') => void;
  onDownloadChapter?: (format: 'md' | 'json') => void;
  practiceError?: string;
  progressMessage?: string;
};

type ReadyProps = Props & { bank: DriveBank; lesson: Lesson };

function newProgress(lessonId: string): LessonProgress {
  return { lessonId, status: 'learning', currentConceptIndex: 0, currentSectionIndex: 0, completedConceptIds: [], completedSectionIds: [], answeredCheckIds: [], skippedChecks: [], summaryOpen: false, revealedSteps: {}, learnStartedAt: new Date().toISOString() };
}

function LessonSectionContent({ section, onReveal, revealedSteps, uiLang, hideSingleConceptHeading = false, solutionLocked = false }: {
  section: LessonSection; onReveal: (key: string, value: number) => void; revealedSteps: Record<string, number>; uiLang: 'fa' | 'en'; hideSingleConceptHeading?: boolean; solutionLocked?: boolean;
}) {
  return <div className="lesson-section-content">
    {section.concepts.map(({ concept, conceptIndex, blocks }) => {
      const content = <div className="lesson-concept-blocks">{blocks.map((block, blockIndex) => {
        const originalIndex = concept.blocks.indexOf(block);
        if (isRedundantOpeningHeading(concept, block, originalIndex)) return null;
        const key = `${concept.id}:${originalIndex >= 0 ? originalIndex : blockIndex}`;
        return <LessonBlockView key={key} block={block} blockKey={key} revealed={revealedSteps[key] ?? 0} onReveal={value => onReveal(key, value)} uiLang={uiLang} solutionLocked={solutionLocked} />;
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

function ReadyLegacyLessonScreen({ bank, lesson, initialProgress, onBack, onProgress, onStartPractice, practiceError, progressMessage, onDownloadLesson, onDownloadChapter }: ReadyProps) {
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

  const setWork = useCallback((key: string, { steps }: { type: 'math'; steps: Step[] }) => {
    const before = progressRef.current;
    const workAnswers = { ...before.workAnswers };
    const previous = workAnswers[key];
    const blank = steps.every(step => stepIsBlank(step));
    if (blank && !previous) return;
    if (previous && previous.steps === steps) return;
    if (blank) delete workAnswers[key];
    else workAnswers[key] = { type: 'math', steps };
    commitProgress({ ...before, workAnswers: Object.keys(workAnswers).length ? workAnswers : undefined });
  }, [commitProgress]);

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
    const checkAnswers = { ...before.checkAnswers };
    if (value) checkAnswers[questionId] = value;
    else delete checkAnswers[questionId];
    const answeredCheckIds = answered
      ? [...new Set([...before.answeredCheckIds, questionId])]
      : before.answeredCheckIds.filter(id => id !== questionId);
    const skippedChecks = answered ? before.skippedChecks.filter(item => item.questionId !== questionId) : before.skippedChecks;
    commitProgress({ ...before, answeredCheckIds, skippedChecks, ...(Object.keys(checkAnswers).length ? { checkAnswers } : { checkAnswers: undefined }) });
  }, [commitProgress]);

  const setConfidence = useCallback((questionId: string, value: 1 | 2 | 3 | 4 | 5) => {
    const before = progressRef.current;
    commitProgress({ ...before, confidenceByCheckId: { ...before.confidenceByCheckId, [questionId]: value } });
  }, [commitProgress]);

  function confirmSkip() {
    if (!skipQuestion) return;
    const before = progressRef.current;
    const skippedChecks = before.skippedChecks.some(item => item.questionId === skipQuestion.id)
      ? before.skippedChecks
      : [...before.skippedChecks, { questionId: skipQuestion.id, at: new Date().toISOString() }];
    commitProgress({ ...before, skippedChecks });
    setSkipQuestion(null);
  }

  function revealStep(key: string, value: number) {
    const before = progressRef.current;
    commitProgress({ ...before, revealedSteps: { ...before.revealedSteps, [key]: value } });
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
      if (allChecksComplete) completedConceptIds.add(concept.id);
    }
    const nextIndex = sectionIndex + 1;
    const nextSection = sections[nextIndex];
    if (nextSection) {
      const conceptIndex = nextSection.concepts[0]?.conceptIndex ?? 0;
      commitProgress({ ...before, currentConceptIndex: conceptIndex, currentSectionIndex: nextIndex, completedConceptIds: [...completedConceptIds], summaryOpen: false });
      setSectionIndex(nextIndex);
      return;
    }
    const noPractice = practiceQuestions.length === 0;
    commitProgress({ ...before, currentConceptIndex: currentSection.concepts.at(-1)?.conceptIndex ?? before.currentConceptIndex, currentSectionIndex: sectionIndex, completedConceptIds: [...completedConceptIds], status: noPractice ? 'done' : 'learning', summaryOpen: true, learnDoneAt: new Date().toISOString() });
    setSummary(true);
  }, [bank, commitProgress, conceptComplete, currentSection, isCheckComplete, practiceQuestions.length, sectionIndex, sections]);

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

  const renderCheck = (question: BankQuestion) => <LessonCheck key={question.id} question={question}
          uiLang={uiLang}
          mathStore={question.answerType === 'math' || (!question.answerType && question.mode === 'math') ? getMathStore(question) : undefined}
          answer={progress.checkAnswers?.[question.id]} answered={progress.answeredCheckIds.includes(question.id)} confidence={progress.confidenceByCheckId?.[question.id]}
          skipped={progress.skippedChecks.some(item => item.questionId === question.id)}
          onAnswer={setAnswer} onConfidence={setConfidence} onSkip={questionId => { skipCheckInvoker.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setSkipQuestion(allQuestions.get(questionId) ?? null); }} />;

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
    if (skipLearn) setSkipPracticeOpen(false);
    onStartPractice(lesson, next, practiceBatch);
  }
  return <section className="lesson-screen" aria-label={fa ? 'درس‌نامه' : 'Lesson notes'} lang={uiLang} dir={fa ? 'rtl' : 'ltr'}>
    <header className="lesson-header">
      <Button variant="ghost" className="lesson-back" onClick={onBack}><ArrowLeft aria-hidden="true" />{fa ? 'بازگشت به تمرین' : 'Back to question'}</Button>
      <LessonDownloadControls uiLang={uiLang} onDownloadLesson={onDownloadLesson} onDownloadChapter={onDownloadChapter} />
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
        <LessonWorkPane items={workItems} selected={selectedWorkItem} onSelect={setSelectedWorkKey} uiLang={uiLang} getWorkStore={getWorkStore} onWork={setWork} renderCheck={renderCheck} savedSteps={key => progress.workAnswers?.[key]?.steps} />
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

function LessonDownloadControls({ uiLang, onDownloadLesson, onDownloadChapter }: {
  uiLang: 'fa' | 'en'; onDownloadLesson?: (format: 'md' | 'json') => void; onDownloadChapter?: (format: 'md' | 'json') => void;
}) {
  const fa = uiLang === 'fa';
  const menu = (title: string, id: string, download?: (format: 'md' | 'json') => void) => download && <details className="lesson-export-menu" key={id}>
    <summary aria-label={title}>{title}</summary>
    <div className="lesson-export-menu-options" aria-label={title}>
      <Button variant="ghost" onClick={event => { download('md'); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{fa ? 'Markdown (.md)' : 'Markdown (.md)'}</Button>
      <Button variant="ghost" onClick={event => { download('json'); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{fa ? 'JSON (.json)' : 'JSON (.json)'}</Button>
    </div>
  </details>;
  return <div className="lesson-download-controls">
    {menu(fa ? 'دانلود خروجی کامل درس' : 'Download full lesson export', 'lesson-export', onDownloadLesson)}
    {menu(fa ? 'دانلود خروجی کامل فصل' : 'Download full chapter export', 'chapter-export', onDownloadChapter)}
  </div>;
}

function ReadyActiveLessonFlow({ bank, lesson, initialProgress, onBack, onProgress, onStartPractice, practiceError, progressMessage, onDownloadLesson, onDownloadChapter }: ReadyProps) {
  const layout = useWorkspaceLayout(), phone = layout === 'phone';
  const uiLang = lessonUiLanguage(lesson), fa = uiLang === 'fa';
  const chunks = useMemo(() => buildActiveLessonChunks(lesson), [lesson]);
  const legacySections = useMemo(() => buildLessonSections(lesson), [lesson]);
  const questionById = useMemo(() => new Map(bank.questions.map(question => [question.id, question])), [bank.questions]);
  const allPracticeQuestions = useMemo(() => getPracticeQuestions(bank, lesson.id), [bank, lesson.id]);
  const initialChunkIndex = useMemo(() => {
    const savedId = initialProgress?.currentChunkId;
    const savedAt = savedId ? chunks.findIndex(chunk => chunk.id === savedId) : -1;
    if (savedAt >= 0) return savedAt;
    const conceptIndex = initialProgress?.currentConceptIndex ?? 0;
    return Math.max(0, chunks.findIndex(chunk => chunk.conceptIndex === conceptIndex));
  }, [chunks, initialProgress]);
  const [progress, setProgress] = useState<LessonProgress>(() => initialProgress ?? newProgress(lesson.id));
  const progressRef = useRef(progress);
  const [chunkIndex, setChunkIndex] = useState(initialChunkIndex);
  const [lessonSummary, setLessonSummary] = useState(initialProgress?.summaryOpen ?? (!!initialProgress?.learnDoneAt && initialProgress.status === 'done'));
  const [lessonInfoOpen, setLessonInfoOpen] = useState(false);
  const [paneTab, setPaneTab] = useState<'lesson' | 'work'>('lesson');
  const [selectedWorkKey, setSelectedWorkKey] = useState<string | undefined>();
  const [splitRatio, setSplitRatio] = useState(readSplitRatio);
  const splitRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryHeadingRef = useRef<HTMLHeadingElement>(null);
  const workStores = useRef(new Map<string, ScratchStore>());
  const paneMode = lessonPaneMode(useSyncExternalStore(subscribeSplit, splitSnapshot, () => false));
  const split = paneMode === 'split';
  const currentChunk = chunks[chunkIndex];
  const phase = progress.activeConceptPhase ?? 'reading';
  const concept = currentChunk?.concept;
  const chunkQuestions = currentChunk?.questionIds.flatMap(id => questionById.get(id) ?? []) ?? [];
  const conceptPracticeQuestions = useMemo(() => concept ? allPracticeQuestions.filter(question =>
    getPracticeQuestionOrigin(question, lesson.id) === 'textbook' && getPracticeQuestionConceptId(question, lesson.id) === concept.id) : [], [allPracticeQuestions, concept, lesson.id]);
  const conceptPracticeBatch = useMemo(() => nextTextbookPracticeBatch(conceptPracticeQuestions, progress.completedPracticeQuestionIds), [conceptPracticeQuestions, progress.completedPracticeQuestionIds]);
  const conceptWorkItems = useMemo(() => concept ? buildConceptWorkItems(concept, currentChunk?.conceptIndex ?? 0) : [], [concept, currentChunk?.conceptIndex]);
  const selectedWorkItem = resolveSelectedWorkItem(conceptWorkItems, selectedWorkKey);
  const requiredExamples = conceptWorkItems.filter(item => item.kind === 'example');
  const exampleAttempts = progress.exampleAttempts ?? {};
  const examplesAttempted = requiredExamples.every(item => !!exampleAttempts[item.key]?.attemptedAt);
  const savedChunkAnswer = (questionId: string) => {
    const current = progress.chunkAnswers?.[questionId];
    if (current) return current;
    const legacy = progress.checkAnswers?.[questionId];
    if (legacy?.type === 'text' || legacy?.type === 'choice') return { value: legacy.value, updatedAt: progress.learnStartedAt ?? new Date(0).toISOString(), ...(progress.answeredCheckIds.includes(questionId) ? { submittedAt: progress.learnStartedAt ?? new Date(0).toISOString() } : {}) };
    return undefined;
  };
  const chunkIsComplete = (chunk: ActiveLessonChunk | undefined) => !!chunk && chunk.questionIds.every(questionId => {
    const response = savedChunkAnswer(questionId);
    return !!response?.value.trim() && !!response.submittedAt;
  });
  const activeConceptChunks = currentChunk ? chunks.filter(chunk => chunk.concept.id === currentChunk.concept.id) : [];
  const activeConceptChunkIndex = activeConceptChunks.findIndex(chunk => chunk.id === currentChunk?.id);
  const isFinalChunkForConcept = activeConceptChunkIndex === activeConceptChunks.length - 1;
  const completedChunks = new Set(progress.completedLearningChunkIds ?? []);
  const allCompletedChunkIds = chunks.filter(chunk => chunkIsComplete(chunk)).map(chunk => chunk.id);
  const totalChunkAnswerCount = allCompletedChunkIds.length;
  const completedConceptCount = progress.completedConceptIds.length;
  const uncompletedPractice = allPracticeQuestions.filter(question => !(progress.completedPracticeQuestionIds ?? []).includes(question.id));
  const practiceBatch = uncompletedPractice.slice(0, MAX_SESSION_EXERCISES);
  const conceptSummary = !!concept && progress.conceptSummaryId === concept.id && phase === 'summary';
  const summaryOpen = lessonSummary;

  const commitProgress = useCallback((next: LessonProgress) => {
    progressRef.current = next;
    setProgress(next);
    onProgress?.(next);
  }, [onProgress]);

  useEffect(() => {
    if (!currentChunk || progressRef.current.currentChunkId === currentChunk.id) return;
    commitProgress({ ...progressRef.current, currentChunkId: currentChunk.id, currentConceptIndex: currentChunk.conceptIndex, activeConceptPhase: progressRef.current.activeConceptPhase ?? 'reading' });
  }, [commitProgress, currentChunk]);

  useEffect(() => {
    const target = summaryOpen ? summaryHeadingRef.current : headingRef.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
  }, [chunkIndex, phase, summaryOpen, conceptSummary]);

  const getWorkStore = useCallback((item: LessonWorkItem) => {
    let store = workStores.current.get(item.key);
    if (!store) {
      store = createLessonMathStore(item.workQuestion, phone, progressRef.current.workAnswers?.[item.key]?.steps);
      workStores.current.set(item.key, store);
    }
    return store;
  }, [phone]);

  const setWork = useCallback((key: string, { steps }: { type: 'math'; steps: Step[] }) => {
    const before = progressRef.current;
    const workAnswers = { ...before.workAnswers };
    const previous = workAnswers[key];
    const blank = steps.every(step => stepIsBlank(step));
    if (blank && !previous) return;
    if (previous && previous.steps === steps) return;
    if (blank) delete workAnswers[key];
    else workAnswers[key] = { type: 'math', steps };
    let attempts = before.exampleAttempts;
    if (!blank && key.startsWith('ex:') && !attempts?.[key]) attempts = { ...attempts, [key]: { attemptedAt: new Date().toISOString() } };
    commitProgress({ ...before, ...(attempts ? { exampleAttempts: attempts } : {}), workAnswers: Object.keys(workAnswers).length ? workAnswers : undefined });
  }, [commitProgress]);

  function compareExample(key: string) {
    const before = progressRef.current, attempt = before.exampleAttempts?.[key];
    if (!attempt || attempt.comparedAt) return;
    commitProgress({ ...before, exampleAttempts: { ...before.exampleAttempts, [key]: { ...attempt, comparedAt: new Date().toISOString() } } });
  }

  function changeChunkAnswer(questionId: string, value: string) {
    const before = progressRef.current;
    const chunkAnswers = { ...before.chunkAnswers, [questionId]: { value, updatedAt: new Date().toISOString() } };
    commitProgress({ ...before, chunkAnswers });
  }

  function submitChunkAnswer(questionId: string) {
    const before = progressRef.current, response = before.chunkAnswers?.[questionId];
    if (!response?.value.trim()) return;
    const now = new Date().toISOString();
    commitProgress({ ...before, chunkAnswers: { ...before.chunkAnswers, [questionId]: { ...response, updatedAt: now, submittedAt: now } } });
  }

  function updateLegacySection(nextChunk: ActiveLessonChunk) {
    const sourceIndex = legacySections.findIndex(section => section.concepts.some(entry => entry.concept.id === nextChunk.concept.id));
    return Math.max(0, sourceIndex);
  }

  function completeChunk(next: ActiveLessonChunk, phaseNext: 'reading' | 'solving') {
    const before = progressRef.current;
    const doneIds = [...new Set([...(before.completedLearningChunkIds ?? []), currentChunk!.id])];
    commitProgress({ ...before, currentChunkId: next.id, currentConceptIndex: next.conceptIndex, currentSectionIndex: updateLegacySection(next), completedLearningChunkIds: doneIds, activeConceptPhase: phaseNext, conceptSummaryId: undefined, summaryOpen: false });
    setChunkIndex(chunks.findIndex(chunk => chunk.id === next.id));
    setPaneTab('lesson');
  }

  function nextFromReading() {
    if (!currentChunk || !chunkIsComplete(currentChunk)) return;
    if (!isFinalChunkForConcept) {
      const next = chunks[chunkIndex + 1];
      if (next) completeChunk(next, 'reading');
      return;
    }
    const before = progressRef.current;
    const doneIds = [...new Set([...(before.completedLearningChunkIds ?? []), currentChunk.id])];
    commitProgress({ ...before, completedLearningChunkIds: doneIds, currentChunkId: currentChunk.id, activeConceptPhase: 'solving', conceptSummaryId: undefined, currentConceptIndex: currentChunk.conceptIndex, currentSectionIndex: updateLegacySection(currentChunk), summaryOpen: false });
    setPaneTab('lesson');
  }

  function previousUnit() {
    if (!currentChunk) return;
    if (conceptSummary) {
      commitProgress({ ...progressRef.current, conceptSummaryId: undefined, activeConceptPhase: 'solving' });
      return;
    }
    if (phase === 'solving') {
      const first = chunks.findIndex(chunk => chunk.concept.id === currentChunk.concept.id);
      const last = chunkIndex > first ? chunkIndex - 1 : chunkIndex;
      commitProgress({ ...progressRef.current, currentChunkId: chunks[last].id, activeConceptPhase: 'reading', conceptSummaryId: undefined });
      setChunkIndex(last); setPaneTab('lesson'); return;
    }
    if (chunkIndex > 0) {
      const previous = chunks[chunkIndex - 1];
      commitProgress({ ...progressRef.current, currentChunkId: previous.id, currentConceptIndex: previous.conceptIndex, currentSectionIndex: updateLegacySection(previous), activeConceptPhase: 'reading' });
      setChunkIndex(chunkIndex - 1); setPaneTab('lesson');
    }
  }

  function startConceptPractice() {
    if (!concept || !examplesAttempted || !conceptPracticeQuestions.length) return;
    const nextBatch = nextTextbookPracticeBatch(conceptPracticeQuestions, progressRef.current.completedPracticeQuestionIds);
    if (!nextBatch.length) return;
    const now = new Date().toISOString();
    const next: LessonProgress = {
      ...progressRef.current,
      status: 'practising',
      currentChunkId: currentChunk?.id,
      currentConceptIndex: currentChunk?.conceptIndex ?? progressRef.current.currentConceptIndex,
      currentSectionIndex: updateLegacySection(currentChunk!),
      activeConceptPhase: 'solving',
      conceptSummaryId: undefined,
      activePracticeConceptId: concept.id,
      activePracticeSectionId: undefined,
      activePracticeQuestionIds: nextBatch.map(question => question.id),
      summaryOpen: false,
      practiceStartedAt: now,
    };
    commitProgress(next);
    onStartPractice(lesson, next, nextBatch, undefined, concept.id);
  }

  function finishWithoutBookQuestions() {
    if (!concept || !examplesAttempted || conceptPracticeQuestions.length) return;
    const before = progressRef.current;
    commitProgress({ ...before, completedConceptIds: [...new Set([...before.completedConceptIds, concept.id])], activeConceptPhase: 'summary', conceptSummaryId: concept.id, status: 'learning', summaryOpen: false });
  }

  function nextConceptFromSummary() {
    if (!concept) return;
    const next = chunks.find(chunk => chunk.conceptIndex > currentChunk!.conceptIndex);
    const before = progressRef.current;
    if (next) {
      commitProgress({ ...before, currentChunkId: next.id, currentConceptIndex: next.conceptIndex, currentSectionIndex: updateLegacySection(next), activeConceptPhase: 'reading', conceptSummaryId: undefined, summaryOpen: false });
      setChunkIndex(chunks.findIndex(chunk => chunk.id === next.id));
      setPaneTab('lesson');
      return;
    }
    commitProgress({ ...before, conceptSummaryId: undefined, activeConceptPhase: 'summary', summaryOpen: true, status: 'learning', learnDoneAt: before.learnDoneAt ?? new Date().toISOString() });
    setLessonSummary(true);
  }

  function reviewActiveLesson() {
    const first = chunks[0];
    if (!first) return;
    setLessonSummary(false);
    setChunkIndex(0);
    setPaneTab('lesson');
    commitProgress({ ...progressRef.current, currentChunkId: first.id, currentConceptIndex: first.conceptIndex, currentSectionIndex: updateLegacySection(first), activeConceptPhase: 'reading', conceptSummaryId: undefined, summaryOpen: false });
  }

  function startRemainingPractice() {
    if (!practiceBatch.length) return;
    const now = new Date().toISOString();
    const next = { ...progressRef.current, status: 'practising' as const, activePracticeConceptId: undefined, activePracticeSectionId: undefined, activePracticeQuestionIds: practiceBatch.map(question => question.id), summaryOpen: true, practiceStartedAt: now };
    commitProgress(next);
    onStartPractice(lesson, next, practiceBatch);
  }

  function updateSplitRatio(value: number) { const next = clampSplitRatio(value); setSplitRatio(next); writeSplitRatio(next); }
  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    const container = splitRef.current;
    if (!container) return;
    event.preventDefault();
    const rtl = getComputedStyle(container).direction === 'rtl';
    const move = (e: PointerEvent) => updateSplitRatio(ratioFromPointer(e.clientX, container.getBoundingClientRect(), rtl));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }
  function resizeByKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    const rtl = splitRef.current ? getComputedStyle(splitRef.current).direction === 'rtl' : fa;
    const grow = rtl ? 'ArrowLeft' : 'ArrowRight', shrink = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === grow) { event.preventDefault(); updateSplitRatio(splitRatio + 5); }
    else if (event.key === shrink) { event.preventDefault(); updateSplitRatio(splitRatio - 5); }
    else if (event.key === 'Home') { event.preventDefault(); updateSplitRatio(30); }
    else if (event.key === 'End') { event.preventDefault(); updateSplitRatio(70); }
  }

  if (!currentChunk || !concept) return <LessonAvailability loading={false} onBack={onBack} />;
  const pageText = currentChunk.startPage ? currentChunk.startPage === currentChunk.endPage
    ? localizeLessonDigits(currentChunk.startPage, uiLang)
    : `${localizeLessonDigits(currentChunk.startPage, uiLang)}–${localizeLessonDigits(currentChunk.endPage ?? currentChunk.startPage + 1, uiLang)}` : '';
  const displaySection: LessonSection = {
    id: currentChunk.id,
    title: currentChunk.title,
    ...(currentChunk.startPage ? { startPage: currentChunk.startPage, endPage: currentChunk.endPage } : {}),
    concepts: [{ concept, conceptIndex: currentChunk.conceptIndex, blocks: phase === 'solving' ? concept.blocks : currentChunk.blocks }],
  };
  const currentConceptChunksDone = activeConceptChunks.filter(chunk => completedChunks.has(chunk.id) || chunkIsComplete(chunk)).length;

  return <section className="lesson-screen lesson-active-flow" aria-label={fa ? 'درس‌نامهٔ تعاملی' : 'Interactive lesson'} lang={uiLang} dir={fa ? 'rtl' : 'ltr'}>
    <header className="lesson-header">
      <Button variant="ghost" className="lesson-back" onClick={onBack}><ArrowLeft aria-hidden="true" />{fa ? 'بازگشت به تمرین' : 'Back to question'}</Button>
      <LessonDownloadControls uiLang={uiLang} onDownloadLesson={onDownloadLesson} onDownloadChapter={onDownloadChapter} />
      <Button variant="ghost" className="lesson-info-toggle" aria-expanded={lessonInfoOpen} aria-controls="lesson-info-panel" onClick={() => setLessonInfoOpen(open => !open)}>
        <span>{fa ? (lessonInfoOpen ? 'بستن اطلاعات درس' : 'اطلاعات درس') : (lessonInfoOpen ? 'Hide lesson information' : 'Lesson information')}</span>
        <ChevronDown aria-hidden="true" className={lessonInfoOpen ? 'lesson-info-chevron lesson-info-chevron-open' : 'lesson-info-chevron'} />
      </Button>
      <div id="lesson-info-panel" className={`lesson-info-panel${lessonInfoOpen ? '' : ' lesson-info-panel-collapsed'}`}>
        <p className="lesson-book-line" dir="ltr"><bdi>{lesson.book}</bdi> · {lesson.section}{lesson.pages && <> · <bdi>pp. {lesson.pages.replace(/(\d)\s*-\s*(\d)/, '$1–$2')}</bdi></>}</p>
        <LessonSourceAttribution book={lesson.book} section={lesson.section} />
      </div>
      <h1 lang={languageForText(lesson.title)} dir={contentDirection(lesson.title)}><LessonText text={displayEducationalHeading(lesson.title)} /></h1>
      {practiceError && <p className="lesson-practice-error" role="alert">{practiceError}</p>}
      {progressMessage && <p className="lesson-progress-message" role="alert">{progressMessage}</p>}
      {!summaryOpen && <div className="lesson-active-progress" aria-label={fa ? 'پیشرفت فصل' : 'Chapter progress'}>
        <p role="status" aria-live="polite">{fa ? `${localizeLessonDigits(totalChunkAnswerCount, uiLang)} از ${localizeLessonDigits(chunks.length, uiLang)} گام پاسخ داده شد · ${localizeLessonDigits(completedConceptCount, uiLang)} از ${localizeLessonDigits(lesson.concepts.length, uiLang)} مفهوم کامل شد` : `${totalChunkAnswerCount} of ${chunks.length} chunks answered · ${completedConceptCount} of ${lesson.concepts.length} concepts complete`}</p>
        <div className="lesson-active-progress-track" role="progressbar" aria-label={fa ? 'پیشرفت گام‌های درس' : 'Lesson chunk progress'} aria-valuemin={0} aria-valuemax={chunks.length} aria-valuenow={totalChunkAnswerCount}><span style={{ width: `${totalChunkAnswerCount / Math.max(chunks.length, 1) * 100}%` }} /></div>
      </div>}
    </header>

    {summaryOpen ? <section className="lesson-summary" aria-labelledby="active-lesson-summary-title">
      <div className="lesson-summary-heading"><BookOpen aria-hidden="true" /><h2 id="active-lesson-summary-title" ref={summaryHeadingRef} tabIndex={-1}>{fa ? 'جمع‌بندی فصل' : 'Chapter summary'}</h2></div>
      <p className="lesson-active-summary-progress">{fa ? `${localizeLessonDigits(completedConceptCount, uiLang)} از ${localizeLessonDigits(lesson.concepts.length, uiLang)} مفهوم کامل شده است.` : `${completedConceptCount} of ${lesson.concepts.length} concepts completed.`}</p>
      <ul className="lesson-summary-concepts">{lesson.concepts.map((entry, index) => <li key={entry.id}>
        <span><span>{localizeLessonDigits(index + 1, uiLang)}. </span><bdi lang={languageForText(entry.title)} dir={contentDirection(entry.title)}><LessonText text={displayEducationalHeading(entry.title)} /></bdi></span>
        <span className="lesson-summary-count">{progress.completedConceptIds.includes(entry.id) ? (fa ? 'کامل شد' : 'Complete') : (fa ? 'باقی مانده' : 'Remaining')}</span>
      </li>)}</ul>
      {uncompletedPractice.length > 0 ? <section className="lesson-section-practice">
        <h3>{fa ? 'تمرین‌های تکمیلی یا باقی‌ماندهٔ فصل' : 'Remaining chapter practice'}</h3>
        <p>{fa ? `${localizeLessonDigits(uncompletedPractice.length, uiLang)} سؤال باقی مانده است. تمرین‌های کتاب پیش از تمرین‌های تکمیلی می‌آیند.` : `${uncompletedPractice.length} questions remain. Textbook exercises come before extra practice.`}</p>
        <Button className="lesson-primary-action" onClick={startRemainingPractice}>{fa ? 'ادامهٔ تمرین فصل' : 'Continue chapter practice'}</Button>
      </section> : <p className="lesson-section-practice-done" role="status">{fa ? 'همهٔ تمرین‌های فصل انجام شده‌اند.' : 'All chapter practice is complete.'}</p>}
      <Button className="lesson-review-action" onClick={reviewActiveLesson}>{fa ? 'مرور دوبارهٔ درس' : 'Review lesson'}</Button>
    </section> : conceptSummary ? <section className="lesson-concept-summary" aria-labelledby="concept-summary-title">
      <h2 id="concept-summary-title" ref={summaryHeadingRef} tabIndex={-1}>{fa ? 'جمع‌بندی این مفهوم' : 'Concept summary'}</h2>
      <p className="lesson-concept-summary-title" lang={languageForText(concept.title)} dir={contentDirection(concept.title)}><LessonText text={displayEducationalHeading(concept.title)} /></p>
      <p>{fa ? `پرسش‌های نوشتاری: ${localizeLessonDigits(currentConceptChunksDone, uiLang)} از ${localizeLessonDigits(activeConceptChunks.length, uiLang)} گام ثبت شد؛ مثال‌ها: ${localizeLessonDigits(requiredExamples.filter(item => !!exampleAttempts[item.key]?.attemptedAt).length, uiLang)} از ${localizeLessonDigits(requiredExamples.length, uiLang)} تلاش شد؛ تمرین‌های کتاب: ${localizeLessonDigits(conceptPracticeQuestions.length, uiLang)} از ${localizeLessonDigits(conceptPracticeQuestions.filter(question => (progress.completedPracticeQuestionIds ?? []).includes(question.id)).length, uiLang)} انجام شد.` : `${currentConceptChunksDone} of ${activeConceptChunks.length} reading chunks answered; ${requiredExamples.filter(item => !!exampleAttempts[item.key]?.attemptedAt).length} of ${requiredExamples.length} examples attempted; ${conceptPracticeQuestions.filter(question => (progress.completedPracticeQuestionIds ?? []).includes(question.id)).length} of ${conceptPracticeQuestions.length} book exercises completed.`}</p>
      <section className="lesson-active-summary-group"><h3>{fa ? 'پرسش‌هایی که جواب دادی' : 'Your chunk responses'}</h3>
        {activeConceptChunks.map((chunk, index) => <details key={chunk.id} className="lesson-summary-answer-group"><summary>{fa ? `گام ${localizeLessonDigits(index + 1, uiLang)} · ${chunk.title}` : `Chunk ${index + 1} · ${chunk.title}`}</summary>
          {chunk.questionIds.map(questionId => {
            const question = questionById.get(questionId); const answer = savedChunkAnswer(questionId);
            return <article key={questionId} className="lesson-summary-answer"><p>{question?.prompt || question?.source}</p><p className="lesson-summary-student-answer">{answer?.value || (fa ? 'پاسخی ثبت نشده' : 'No response saved')}</p><p className="lesson-no-key">{fa ? 'بدون کلید؛ برای بررسی خروجی را بفرست' : 'No answer key; send your export for review.'}</p></article>;
          })}
        </details>)}
      </section>
      <section className="lesson-active-summary-group"><h3>{fa ? 'تلاش برای مثال‌ها' : 'Worked-example attempts'}</h3>
        {requiredExamples.length ? <ul>{requiredExamples.map(item => <li key={item.key}>{item.title} · {exampleAttempts[item.key]?.attemptedAt ? (fa ? `تلاش ثبت شد${exampleAttempts[item.key].comparedAt ? '؛ با حل درس‌نامه مقایسه شد' : ''}` : `Attempt saved${exampleAttempts[item.key].comparedAt ? '; compared with lesson solution' : ''}`) : (fa ? 'تلاش ثبت نشده' : 'Not attempted')}</li>)}</ul> : <p>{fa ? 'برای این مفهوم مثال حل‌شده‌ای ثبت نشده است.' : 'No worked examples are attached to this concept.'}</p>}
      </section>
      <section className="lesson-active-summary-group"><h3>{fa ? 'تمرین‌های کتاب و کار ثبت‌شده' : 'Book exercises and saved work'}</h3>
        {conceptPracticeQuestions.length ? <div className="lesson-summary-exercises">{conceptPracticeQuestions.map(question => {
          const result = progress.practiceResults?.[question.id];
          return <details key={question.id} className="lesson-summary-answer-group"><summary><bdi dir="ltr">{question.id}</bdi> · {result?.status === 'answered' ? (fa ? 'پاسخ ثبت شد' : 'Answered') : result?.status === 'draft' ? (fa ? 'پیش‌نویس' : 'Draft') : result?.status === 'skipped' ? (fa ? 'ردشده' : 'Skipped') : (fa ? 'انجام نشده' : 'Not started')}</summary>
            <p lang={languageForText(question.prompt || question.source)} dir={contentDirection(question.prompt || question.source)}><LessonText text={question.prompt || question.source} /></p>
            {question.mode === 'math' && <QuestionSource source={question.source} mode={question.mode} label={fa ? 'صورت تمرین' : 'Exercise prompt'} mathLabel={fa ? 'صورت ریاضی تمرین' : 'Exercise expression'} textClassName="lesson-check-source-text" mathClassName="lesson-check-source" />}
            {result?.answer && <p className="lesson-summary-student-answer">{result.answer}</p>}
            {!!result?.steps.length && <ol>{result.steps.map((step, stepIndex) => <li key={stepIndex}><bdi dir="ltr"><MathDisplay latex={step.latex} label={fa ? `گام ${localizeLessonDigits(stepIndex + 1, uiLang)}` : `Step ${stepIndex + 1}`} display={false} /></bdi>{step.final ? ` · ${fa ? 'پاسخ نهایی' : 'Final answer'}` : ''}</li>)}</ol>}
            {result?.updatedAt && <time dateTime={result.updatedAt}>{fa ? `آخرین ذخیره: ${result.updatedAt}` : `Last saved: ${result.updatedAt}`}</time>}
            <p className="lesson-no-key">{fa ? 'بدون کلید؛ برای بررسی خروجی را بفرست' : 'No answer key; send your export for review.'}</p>
          </details>;
        })}</div> : <p>{fa ? 'برای این مفهوم تمرین کتابی ثبت نشده است.' : 'No book exercises are assigned to this concept.'}</p>}
      </section>
      <p className="lesson-section-practice-done" role="status">{fa ? 'مراحل لازم این مفهوم کامل است. پاسخ‌ها نمره‌گذاری نشده‌اند؛ تنها مثال‌های حل‌شده امکان مقایسه دارند.' : 'This concept is complete. Responses are not automatically graded; worked examples can be compared with their lesson solutions.'}</p>
      <div className="lesson-concept-navigation"><Button onClick={previousUnit}>{fa ? 'مرور مثال‌ها' : 'Review examples'}</Button><Button className="lesson-primary-action" onClick={nextConceptFromSummary}>{chunkIndex === chunks.length - 1 ? (fa ? 'پایان و جمع‌بندی فصل ←' : 'Finish chapter summary →') : (fa ? 'مفهوم بعدی ←' : 'Next concept →')}</Button></div>
    </section> : <>
      {!split && <div className="lesson-pane-tabs" role="tablist" aria-label={fa ? 'درس‌نامه یا کار من' : 'Lesson or your work'}>
        <button type="button" role="tab" id="lesson-tab-lesson" aria-controls="lesson-panel-lesson" aria-selected={paneTab === 'lesson'} className="lesson-pane-tab" onClick={() => setPaneTab('lesson')}>{fa ? 'درس‌نامه' : 'Lesson'}</button>
        <button type="button" role="tab" id="lesson-tab-work" aria-controls="lesson-panel-work" aria-selected={paneTab === 'work'} className="lesson-pane-tab" onClick={() => setPaneTab('work')}>{fa ? (phase === 'reading' ? 'پاسخ‌نویسی' : 'کار من') : (phase === 'reading' ? 'Write answers' : 'Your work')}{phase === 'reading' ? ` · ${localizeLessonDigits(chunkQuestions.length, uiLang)}` : ` · ${localizeLessonDigits(conceptWorkItems.length, uiLang)}`}</button>
      </div>}
      <div ref={splitRef} className={`lesson-split ${split ? 'lesson-split-wide' : 'lesson-split-tabs'}`} data-pane-mode={paneMode} style={split ? { ['--lesson-split' as string]: `${splitRatio}%` } : undefined}>
        {(split || paneTab === 'lesson') && <div className="lesson-split-lesson" id="lesson-panel-lesson" {...(split ? {} : { role: 'tabpanel', 'aria-labelledby': 'lesson-tab-lesson' })}>
          <section className="lesson-concept" aria-labelledby="lesson-concept-title">
            <div className="lesson-concept-heading"><p className="lesson-section-label">{fa ? `مفهوم ${localizeLessonDigits(currentChunk.conceptIndex + 1, uiLang)} از ${localizeLessonDigits(lesson.concepts.length, uiLang)} · گام ${localizeLessonDigits(activeConceptChunkIndex + 1, uiLang)} از ${localizeLessonDigits(activeConceptChunks.length, uiLang)}` : `Concept ${currentChunk.conceptIndex + 1} of ${lesson.concepts.length} · Chunk ${activeConceptChunkIndex + 1} of ${activeConceptChunks.length}`}</p>{pageText && <span className="lesson-pages">{fa ? 'صفحه‌های' : 'Pages'} {pageText}</span>}</div>
            <h2 id="lesson-concept-title" ref={headingRef} tabIndex={-1} lang={languageForText(concept.title)} dir={contentDirection(concept.title)}><LessonText text={displayEducationalHeading(concept.title)} /></h2>
            {phase === 'reading' && currentChunk.title.trim() !== concept.title.trim() && <h3 className="lesson-chunk-title" lang={languageForText(currentChunk.title)} dir={contentDirection(currentChunk.title)}><LessonText text={displayEducationalHeading(currentChunk.title)} /></h3>}
            {phase === 'solving' && <p className="lesson-solving-context">{fa ? 'این مفهوم را خوانده‌ای. حالا مثال‌ها و تمرین‌های کتاب را به ترتیب حل کن.' : 'You have read this concept. Now solve its examples and book exercises in order.'}</p>}
            <LessonSectionContent section={displaySection} revealedSteps={{}} onReveal={() => undefined} uiLang={uiLang} hideSingleConceptHeading solutionLocked />
          </section>
          {phase === 'reading' ? <section className="lesson-concept-navigation" aria-label={fa ? 'پیمایش گام‌های درس' : 'Lesson chunk navigation'}>
            <Button onClick={previousUnit} disabled={chunkIndex === 0}>{fa ? '→ گام قبلی' : '← Previous chunk'}</Button>
            <Button className="lesson-primary-action" onClick={nextFromReading} disabled={!chunkIsComplete(currentChunk)}>{isFinalChunkForConcept ? (fa ? 'رفتن به مثال‌ها و تمرین‌ها ←' : 'Continue to examples and practice →') : (fa ? 'گام بعدی ←' : 'Next chunk →')}</Button>
          </section> : <section className="lesson-concept-navigation" aria-label={fa ? 'حل و تمرین مفهوم' : 'Concept solving controls'}>
            <Button onClick={previousUnit}>{fa ? '→ بازگشت به متن' : '← Back to reading'}</Button>
            {conceptPracticeQuestions.length ? <Button className="lesson-primary-action" onClick={startConceptPractice} disabled={!examplesAttempted || !conceptPracticeBatch.length}>{fa ? `شروع بستهٔ ${localizeLessonDigits(conceptPracticeBatch.length, uiLang)} تمرین کتاب ←` : `Start the next ${conceptPracticeBatch.length} book exercises →`}</Button>
              : <Button className="lesson-primary-action" onClick={finishWithoutBookQuestions} disabled={!examplesAttempted}>{fa ? 'پایان مثال‌ها و جمع‌بندی ←' : 'Finish examples and review →'}</Button>}
          </section>}
          {phase === 'solving' && <section className="lesson-section-practice lesson-concept-practice-list" aria-label={fa ? 'تمرین‌های کتاب این مفهوم' : 'Book exercises for this concept'}>
            <h2>{fa ? 'تمرین‌های کتاب برای همین مفهوم' : 'Book exercises for this concept'}</h2>
            {conceptPracticeQuestions.length ? <>
              <p>{fa ? `${localizeLessonDigits(conceptPracticeQuestions.length, uiLang)} سؤال کتاب، به ترتیب بانک. هر بسته حداکثر ${localizeLessonDigits(MAX_SESSION_EXERCISES, uiLang)} سؤال دارد. ابتدا تلاش برای همهٔ مثال‌های بالا را ثبت کن؛ بعد حل بستهٔ بعدی در ویرایشگر اصلی باز می‌شود.` : `${conceptPracticeQuestions.length} textbook questions in bank order, in batches of at most ${MAX_SESSION_EXERCISES}. Record an attempt for every example above first; then solve the next batch in the main editor.`}</p>
              <ol>{conceptPracticeQuestions.map(question => <li key={question.id}><bdi dir="ltr">{question.id}</bdi>{question.prompt && <> · <span lang={languageForText(question.prompt)} dir={contentDirection(question.prompt)}><LessonText text={question.prompt} /></span></>}</li>)}</ol>
              <p>{fa ? 'برای ادامه باید همهٔ سؤال‌های کتاب را در ویرایشگر اصلی پاسخ‌گذاری کنی. پاسخ درست/نادرست اعلام نمی‌شود؛ کلید پاسخ در بانک عمومی وجود ندارد.' : 'Continue only after attempting every book question in the main editor. No correctness will be claimed; the public bank has no answer keys.'}</p>
            </> : <p>{fa ? 'تمرین کتابی برای این مفهوم ثبت نشده است.' : 'No textbook exercises are assigned to this concept.'}</p>}
            {!examplesAttempted && <p className="lesson-practice-locked" role="status">{fa ? `برای بازشدن تمرین‌ها، ${localizeLessonDigits(requiredExamples.filter(item => !exampleAttempts[item.key]?.attemptedAt).length, uiLang)} مثال باقی‌مانده را در «کار من» تلاش کن.` : `${requiredExamples.filter(item => !exampleAttempts[item.key]?.attemptedAt).length} example attempts remain in Your work before these exercises unlock.`}</p>}
          </section>}
        </div>}
        {split && <div className="lesson-split-handle" role="separator" tabIndex={0} aria-orientation="vertical" aria-label={fa ? 'تغییر عرض درس‌نامه' : 'Resize lesson panel'} aria-valuemin={30} aria-valuemax={70} aria-valuenow={splitRatio} onPointerDown={startResize} onKeyDown={resizeByKey} onDoubleClick={() => updateSplitRatio(50)} />}
        {(split || paneTab === 'work') && <div className="lesson-split-work" id="lesson-panel-work" {...(split ? {} : { role: 'tabpanel', 'aria-labelledby': 'lesson-tab-work' })}>
          {phase === 'reading' ? <LessonChunkChecks key={currentChunk.id} questions={chunkQuestions} answers={Object.fromEntries(chunkQuestions.map(question => [question.id, savedChunkAnswer(question.id)]))} uiLang={uiLang} onChange={changeChunkAnswer} onSubmit={submitChunkAnswer} />
            : <LessonWorkPane items={conceptWorkItems} selected={selectedWorkItem} onSelect={setSelectedWorkKey} uiLang={uiLang} getWorkStore={getWorkStore} onWork={setWork} renderCheck={() => null} savedSteps={key => progress.workAnswers?.[key]?.steps} exampleAttempts={exampleAttempts} onCompareExample={compareExample} />}
        </div>}
      </div>
    </>}
  </section>;
}

function ReadyLessonScreen(props: ReadyProps) {
  return props.lesson.concepts.some(concept => concept.learningChunks?.length)
    ? <ReadyActiveLessonFlow {...props} />
    : <ReadyLegacyLessonScreen {...props} />;
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
