import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { Button } from '../../shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../shared/ui/dialog';
import type { BankQuestion, DriveBank } from '../drive-bank/drive-bank';
import type { Lesson, LessonCheckAnswer, LessonProgress } from './types';
import { getLearnChecks, getPracticeQuestions } from './selectors';
import { LessonCheck } from './lesson-check';
import { contentDirection, displayEducationalHeading, languageForText, LessonConceptContent, LessonText } from './lesson-content';
import { createLessonMathStore } from './lesson-math-check';
import { MathDisplay } from '../../MathDisplay';
import type { ScratchStore } from '../../store';
import { useWorkspaceLayout } from '../../shared/hooks/use-workspace-layout';
import { stepIsBlank } from '../../model';

type Props = {
  bank: DriveBank | null;
  lesson: Lesson | null;
  loading?: boolean;
  initialProgress?: LessonProgress;
  onBack: () => void;
  onProgress?: (progress: LessonProgress) => void;
  onStartPractice: (lesson: Lesson, progress: LessonProgress, questions: BankQuestion[]) => void;
  practiceError?: string;
  progressMessage?: string;
};

type ReadyProps = Props & { bank: DriveBank; lesson: Lesson };

function newProgress(lessonId: string): LessonProgress {
  return { lessonId, status: 'learning', currentConceptIndex: 0, completedConceptIds: [], answeredCheckIds: [], skippedChecks: [], summaryOpen: false, revealedSteps: {}, learnStartedAt: new Date().toISOString() };
}

function ReviewQuestionContent({ question }: { question: BankQuestion }) {
  if (question.prompt) return <span lang={languageForText(question.prompt)} dir={contentDirection(question.prompt)}><LessonText text={question.prompt} /></span>;
  if (question.mode === 'math') return <bdi dir="ltr"><MathDisplay latex={question.source} label="Question expression" display={false} /></bdi>;
  return <span lang={languageForText(question.source)} dir={contentDirection(question.source)}><LessonText text={question.source} /></span>;
}

function ReadyLessonScreen({ bank, lesson, initialProgress, onBack, onProgress, onStartPractice, practiceError, progressMessage }: ReadyProps) {
  const layout = useWorkspaceLayout(), phone = layout === 'phone';
  const practiceQuestions = useMemo(() => getPracticeQuestions(bank, lesson.id), [bank, lesson.id]);
  const [progress, setProgress] = useState<LessonProgress>(() => initialProgress ?? newProgress(lesson.id));
  const progressRef = useRef(progress);
  const [conceptIndex, setConceptIndex] = useState(() => Math.min(Math.max(0, initialProgress?.currentConceptIndex ?? 0), Math.max(0, lesson.concepts.length - 1)));
  const [summary, setSummary] = useState(initialProgress?.summaryOpen ?? (lesson.concepts.length === 0 || initialProgress?.status === 'done' || (!!initialProgress?.learnDoneAt && lesson.concepts.length > 0 && lesson.concepts.every(concept => initialProgress.completedConceptIds.includes(concept.id)))));
  const [skipQuestion, setSkipQuestion] = useState<BankQuestion | null>(null);
  const [skipPracticeOpen, setSkipPracticeOpen] = useState(false);
  const skipCheckInvoker = useRef<HTMLElement | null>(null);
  const skipPracticeInvoker = useRef<HTMLButtonElement>(null);
  const mathStores = useRef(new Map<string, ScratchStore>());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryHeadingRef = useRef<HTMLHeadingElement>(null);
  const autoStartedLesson = useRef<string | null>(null);

  const commitProgress = useCallback((next: LessonProgress) => {
    progressRef.current = next;
    setProgress(next);
    onProgress?.(next);
  }, [onProgress]);

  const currentConcept = lesson.concepts[conceptIndex];
  const checks = useMemo(() => currentConcept ? getLearnChecks(bank, currentConcept.id) : [], [bank, currentConcept]);
  const allQuestions = useMemo(() => new Map(bank.questions.map(question => [question.id, question])), [bank.questions]);

  useEffect(() => {
    (summary ? summaryHeadingRef : headingRef).current?.focus({ preventScroll: true });
  }, [conceptIndex, summary]);

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
    const nextIndex = summary ? Math.max(0, lesson.concepts.length - 1) : Math.max(0, conceptIndex - 1);
    if (!summary && conceptIndex === 0) return;
    const before = progressRef.current;
    if (before.currentConceptIndex !== nextIndex || before.summaryOpen !== false) commitProgress({ ...before, currentConceptIndex: nextIndex, summaryOpen: false });
    setSummary(false);
    setConceptIndex(nextIndex);
  }, [commitProgress, conceptIndex, lesson.concepts.length, summary]);

  const goNext = useCallback(() => {
    if (!currentConcept || !conceptComplete) return;
    const before = progressRef.current;
    const completedConceptIds = [...new Set([...before.completedConceptIds, currentConcept.id])];
    const nextIndex = conceptIndex + 1;
    if (nextIndex < lesson.concepts.length) {
      commitProgress({ ...before, currentConceptIndex: nextIndex, completedConceptIds, summaryOpen: false });
      setConceptIndex(nextIndex);
      return;
    }
    const noPractice = practiceQuestions.length === 0;
    commitProgress({ ...before, currentConceptIndex: conceptIndex, completedConceptIds, status: noPractice ? 'done' : 'learning', summaryOpen: true, learnDoneAt: new Date().toISOString() });
    setSummary(true);
  }, [commitProgress, conceptComplete, conceptIndex, currentConcept, practiceQuestions.length]);

  function startPractice() {
    const before = progressRef.current;
    const now = new Date().toISOString();
    const next: LessonProgress = { ...before, status: 'practising', summaryOpen: true, learnDoneAt: before.learnDoneAt ?? now, practiceStartedAt: now };
    commitProgress(next);
    onStartPractice(lesson, next, practiceQuestions);
  }

  function confirmSkipToPractice() {
    if (!skipPracticeOpen || !practiceQuestions.length) return;
    const before = progressRef.current;
    const now = new Date().toISOString();
    const next: LessonProgress = { ...before, status: 'practising', summaryOpen: false, learnSkipped: { at: now }, practiceStartedAt: now };
    commitProgress(next);
    setSkipPracticeOpen(false);
    onStartPractice(lesson, next, practiceQuestions);
  }

  function reviewLesson() {
    const before = progressRef.current;
    if (before.currentConceptIndex !== 0 || before.summaryOpen !== false) commitProgress({ ...before, currentConceptIndex: 0, summaryOpen: false });
    setSummary(false);
    setConceptIndex(0);
  }

  useEffect(() => {
    function handleConceptShortcut(event: globalThis.KeyboardEvent) {
      if (!(event.altKey && (event.ctrlKey || event.metaKey))) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"], .lesson-math-editor')) return;
      if (event.key === 'ArrowLeft' && (summary || conceptIndex > 0)) {
        event.preventDefault();
        goPrevious();
      } else if (event.key === 'ArrowRight' && !summary && currentConcept && conceptComplete) {
        event.preventDefault();
        goNext();
      }
    }
    window.addEventListener('keydown', handleConceptShortcut);
    return () => window.removeEventListener('keydown', handleConceptShortcut);
  }, [conceptComplete, conceptIndex, currentConcept, goNext, goPrevious, summary]);

  const pages = lesson.pages ? ` · pp. ${lesson.pages.replace(/(\d)\s*-\s*(\d)/, '$1–$2')}` : '';
  return <section className="lesson-screen" aria-label="Lesson">
    <header className="lesson-header">
      <Button variant="ghost" className="lesson-back" onClick={onBack}><ArrowLeft aria-hidden="true" />Back to question</Button>
      <p className="lesson-book-line" dir="ltr">{lesson.book} · {lesson.section}{pages}</p>
      <h1 lang={languageForText(lesson.title)} dir={contentDirection(lesson.title)}><LessonText text={displayEducationalHeading(lesson.title)} /></h1>
      {!summary && currentConcept && <p className="lesson-progress" aria-live="polite">Concept {conceptIndex + 1} of {lesson.concepts.length}</p>}
      {summary && <p className="lesson-progress" aria-live="polite">Learning summary</p>}
      {practiceError && <p className="lesson-practice-error" role="alert">{practiceError}</p>}
      {progressMessage && <p className="lesson-progress-message" role="alert">{progressMessage}</p>}
    </header>

    {summary ? <section className="lesson-summary" aria-labelledby="lesson-summary-title">
      <div className="lesson-summary-heading"><BookOpen aria-hidden="true" /><h2 id="lesson-summary-title" ref={summaryHeadingRef} tabIndex={-1}>Lesson summary</h2></div>
      <ul className="lesson-summary-concepts">{lesson.concepts.map((concept, index) => <li key={concept.id}>
        <span><span dir="ltr">{index + 1}. </span><bdi lang={languageForText(concept.title)} dir={contentDirection(concept.title)}><LessonText text={displayEducationalHeading(concept.title)} /></bdi></span>
        <span className="lesson-summary-count">{getLearnChecks(bank, concept.id).filter(question => progress.answeredCheckIds.includes(question.id)).length}/{getLearnChecks(bank, concept.id).length} checks answered</span>
      </li>)}</ul>
      {lesson.concepts.some(concept => getLearnChecks(bank, concept.id).some(question => progress.answeredCheckIds.includes(question.id) && progress.confidenceByCheckId?.[question.id] === 1)) && <section className="lesson-summary-review" aria-label="Checks to review">
        <h3>Review</h3><ul>{lesson.concepts.flatMap(concept => getLearnChecks(bank, concept.id).filter(question => progress.answeredCheckIds.includes(question.id) && progress.confidenceByCheckId?.[question.id] === 1).map(question => <li key={question.id}><bdi dir="ltr">{question.id}</bdi> · <ReviewQuestionContent question={question} /></li>))}</ul>
      </section>}
      {progress.skippedChecks.length > 0 && <section className="lesson-summary-skipped" aria-label="Skipped checks">
        <h3>Skipped checks</h3><ul>{progress.skippedChecks.map(item => <li key={item.questionId}>{item.questionId}</li>)}</ul>
      </section>}
      {practiceQuestions.length === 0 ? <p className="lesson-no-practice">No practice questions yet</p> : <Button className="lesson-primary-action" onClick={startPractice}>Start practice</Button>}
      <Button className="lesson-review-action" onClick={reviewLesson}>Review lesson</Button>
    </section> : currentConcept ? <>
      <section className="lesson-concept" aria-labelledby="lesson-concept-title">
        <div className="lesson-concept-heading"><p className="lesson-section-label">Concept {conceptIndex + 1}</p>{currentConcept.pages && <span className="lesson-pages">pp. {currentConcept.pages.replace(/(\d)\s*-\s*(\d)/, '$1–$2')}</span>}</div>
        <h2 id="lesson-concept-title" ref={headingRef} tabIndex={-1} lang={languageForText(currentConcept.title)} dir={contentDirection(currentConcept.title)}><LessonText text={displayEducationalHeading(currentConcept.title)} /></h2>
        <LessonConceptContent concept={currentConcept} revealedSteps={progress.revealedSteps} onReveal={revealStep} />
      </section>
      {checks.length > 0 && <section className="lesson-checks" aria-label="Mini checks">
        <h2>Check your understanding</h2>
        {checks.map(question => <LessonCheck key={question.id} question={question}
          mathStore={question.answerType === 'math' || (!question.answerType && question.mode === 'math') ? getMathStore(question) : undefined}
          answer={progress.checkAnswers?.[question.id]} answered={progress.answeredCheckIds.includes(question.id)} confidence={progress.confidenceByCheckId?.[question.id]}
          skipped={progress.skippedChecks.some(item => item.questionId === question.id)}
          onAnswer={setAnswer} onConfidence={setConfidence} onSkip={questionId => { skipCheckInvoker.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setSkipQuestion(allQuestions.get(questionId) ?? null); }} />)}
      </section>}
      <nav className="lesson-concept-navigation" aria-label="Concept navigation">
        <Button onClick={goPrevious} disabled={conceptIndex === 0}>← Previous concept</Button>
        <Button className="lesson-primary-action" onClick={goNext} disabled={!conceptComplete}>Next concept →</Button>
      </nav>
      {practiceQuestions.length > 0 && <Button ref={skipPracticeInvoker} className="lesson-skip-practice" variant="ghost" onClick={() => setSkipPracticeOpen(true)}>Skip to practice</Button>}
    </> : null}

    <Dialog open={!!skipQuestion} onOpenChange={open => { if (!open) setSkipQuestion(null); }}>
      <DialogContent aria-describedby="lesson-skip-description" onCloseAutoFocus={event => { event.preventDefault(); requestAnimationFrame(() => { const target = skipCheckInvoker.current; if (target?.isConnected) target.focus({ preventScroll: true }); else headingRef.current?.focus({ preventScroll: true }); }); }}>
        <DialogTitle>Skip this check?</DialogTitle>
        <DialogDescription id="lesson-skip-description">Skip this check? It will be logged.</DialogDescription>
        <div className="dialog-actions"><Button onClick={() => setSkipQuestion(null)}>Cancel</Button><Button variant="default" className="lesson-primary-action" onClick={confirmSkip}>Skip check</Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={skipPracticeOpen} onOpenChange={setSkipPracticeOpen}>
      <DialogContent aria-describedby="lesson-skip-practice-description" onCloseAutoFocus={event => { event.preventDefault(); requestAnimationFrame(() => { const target = skipPracticeInvoker.current; if (target?.isConnected) target.focus({ preventScroll: true }); else headingRef.current?.focus({ preventScroll: true }); }); }}>
        <DialogTitle>Skip to practice?</DialogTitle>
        <DialogDescription id="lesson-skip-practice-description">This choice will be recorded for this lesson.</DialogDescription>
        <div className="dialog-actions"><Button onClick={() => setSkipPracticeOpen(false)}>Cancel</Button><Button variant="default" className="lesson-primary-action" onClick={confirmSkipToPractice}>Skip to practice</Button></div>
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
