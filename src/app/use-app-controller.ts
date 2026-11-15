import { selectWorkspaceState } from './workspace-state';
import { useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector, useAppStore } from '../hooks';
import { actions, exerciseOf } from '../store';
import { fingerprint } from '../review';
import { diagnosticQuestions } from '../diagnostic';
import { fractionRoundOne } from '../fraction-round-one';

import { useWorkspaceLayout } from '../shared/hooks/use-workspace-layout';
import { questionStatus } from '../features/workspace/model/workspace-layout';
import { clearAppStorage } from '../features/session/persistence/persistent-store';
import { getConfig as getDriveConfig } from '../features/drive-bank/google';
import { getLesson } from '../features/lessons/selectors';
import { emitLearnEvent, type LearnEventContext } from '../sync/events';
import { type ResetKind } from './dialogs-host';
import { usePracticeLauncher } from './practice-launcher';
import { useBankSession } from './use-bank-session';
import { usePracticeEditEvents } from './use-practice-edit-events';
import { useWellbeing } from './use-wellbeing';

import { useLessonFlow } from './use-lesson-flow';
import { useAppActivity, useAppActivityScopes } from './use-app-activity';
import { useSessionTransfer } from './use-session-transfer';
import { useReviewActions } from './use-review-actions';
import { useEditorControls } from './use-editor-controls';
import { useDiagnosticReport } from './use-diagnostic-report';

import { useAppFocus, useAppSync } from './use-app-ui';
import type { LoadedBank } from './use-bank-session';
export function useAppController(initialBank?: LoadedBank) {
  const layout = useWorkspaceLayout(),
    wide = layout !== 'phone';
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [resetKind, setResetKind] = useState<ResetKind | null>(null);
  const [cloudPreviewOpen, setCloudPreviewOpen] = useState(false);
  const menuInvoker = useRef<HTMLButtonElement>(null);
  const state = useAppSelector(selectWorkspaceState),
    store = useAppStore(),
    dispatch = useAppDispatch();
  const sync = useAppSync(state);
  const { serverConflict } = sync;
  const ex = exerciseOf(state.doc),
    exerciseIndex = state.doc.exercises.findIndex((x) => x.id === ex.id);
  const manualTimerPause = useRef(!!ex.timerPaused),
    trackedExerciseId = useRef(ex.id);
  const [menu, setMenu] = useState(false);
  const launcher = usePracticeLauncher(),
    { setup, backup, confirmExam, confirmFractions, jsonForm, openInlinePanel } = launcher;
  const bankSession = useBankSession({ initialBank, store, setTimerPaused: setTrackedTimerPaused });
  const { loadedBank, loadedBankRef, bankTransitionRef, chapterTransitioning, lessonProgressRef } = bankSession;
  const [activeInspector, setActiveInspector] = useState<'drive' | 'sync' | null>(null);
  const driveBankOpen = activeInspector === 'drive';
  const syncPanelOpen = activeInspector === 'sync';
  const [driveBankInitialized, setDriveBankInitialized] = useState(() => !!getDriveConfig().fileId);
  const [, setDriveBankAvailable] = useState(false);
  const [complete, setComplete] = useState(false);
  const [manual, setManual] = useState(''),
    [showResults, setShowResults] = useState(false);
  const editorRoot = useRef<HTMLElement>(null);
  const fractions = ex.assessment === 'fractions-round-1',
    questionBank = fractions ? fractionRoundOne : diagnosticQuestions;
  const exam = !!ex.diagnosticId && state.doc.exercises.some((x) => x.diagnosticId === questionBank.length);
  const answeredCount = state.doc.exercises.filter((x) => questionStatus(x) === 'Answered').length,
    skippedCount = state.doc.exercises.filter((x) => x.skipped).length;
  const copied = !state.copies[ex.id] ? '' : state.copies[ex.id] === fingerprint(state.doc) ? 'Copied' : 'Changed since copy';
  const matchingBank =
    loadedBank && state.doc.session?.bankId === loadedBank.bank.bank_id && state.doc.session?.bankVersion === loadedBank.version
      ? loadedBank
      : null;
  const currentBankQuestion =
    matchingBank && ex.bankQuestionId ? matchingBank.bank.questions.find((question) => question.id === ex.bankQuestionId) : undefined;
  const answerType = ex.answerType ?? currentBankQuestion?.answerType ?? (currentBankQuestion?.mode === 'text' ? 'text' : 'math');
  const answerChoices = ex.choices ?? currentBankQuestion?.choices ?? [];
  const isMathAnswer = answerType === 'math';
  const linkedLesson =
    currentBankQuestion?.stage !== 'learn' ? getLesson(matchingBank?.bank ?? {}, currentBankQuestion?.lessonId) : undefined;
  const sessionId = state.doc.session?.id ?? '';
  const activity = useAppActivity({
    currentBankQuestion,
    loadedBank,
    matchingBank,
    sessionId,
    ex,
    answerType,
    manualTimerPause,
    trackedExerciseId,
  });
  const { activityTracker, practiceEventContext, sessionEventContext, practiceAttemptCounts } = activity;
  const lesson = useLessonFlow({
    store,
    dispatch,
    bankSession,
    matchingBank,
    currentBankQuestion,
    sessionId,
    activityTracker,
    exam,
    menuInvoker,
    setActiveInspector,
    setDriveBankInitialized,
    setShowResults,
    setManual,
    setComplete,
    switchQuestion,
  });
  const { lessonScreen, referenceLesson, activePracticeLessonId, lessonPickerOpen, markLessonPracticeDone } = lesson;
  useAppActivityScopes({
    activityTracker,
    lessonScreen,
    referenceLesson,
    currentBankQuestion,
    loadedBank,
    matchingBank,
    sessionId,
    ex,
    answerType,
  });
  const lessonEventContext = useMemo<LearnEventContext>(
    () => ({ ...sessionEventContext, lesson: lessonScreen?.id ?? 'unknown' }),
    [lessonScreen?.id, sessionEventContext],
  );
  const multipleQuestions = state.doc.exercises.length > 1;
  const batch = multipleQuestions || !!activePracticeLessonId,
    last = exerciseIndex === state.doc.exercises.length - 1;
  usePracticeEditEvents(store, loadedBankRef);
  const wellbeing = useWellbeing({
      multipleQuestions,
      sessionId,
      session: state.doc.session,
      storageConflict: state.storageState?.kind === 'conflict' || !!serverConflict,
    }),
    askWellbeing = wellbeing.askWellbeing;
  const transfer = useSessionTransfer({
    state,
    store,
    dispatch,
    jsonForm,
    openInlinePanel,
    loadedBank,
    lessonProgressRef,
    sessionEventContext,
    sessionId,
    setShowResults,
  });
  const { exportWarning } = transfer;
  const review = useReviewActions({
    markLessonPracticeDone,
    store,
    dispatch,
    ex,
    answerType,
    currentBankQuestion,
    practiceAttemptCounts,
    practiceEventContext,
    setShowResults,
    setManual,
    setComplete,
  });
  const { decision } = review;
  const modalOpen =
    askWellbeing ||
    shortcutsOpen ||
    !!exportWarning ||
    !!resetKind ||
    cloudPreviewOpen ||
    !!decision ||
    complete ||
    lessonPickerOpen ||
    !!referenceLesson ||
    state.storageState?.kind === 'conflict' ||
    !!serverConflict;
  const editor = useEditorControls({
    store,
    dispatch,
    editorRoot,
    ex,
    chapterTransitioning,
    bankTransitionRef,
    modalOpen,
    setup,
    backup,
    confirmExam,
    confirmFractions,
    wide,
    state,
  });
  const { insertOpen } = editor;
  const modalOpenWithEditor = modalOpen || insertOpen;
  useAppFocus({
    menu,
    modalOpenWithEditor,
    driveBankOpen,
    syncPanelOpen,
    lessonScreen: !!lessonScreen,
    editorRoot,
    exerciseId: ex.id,
    setGuidanceOpen,
  });
  function switchQuestion(id: string) {
    dispatch(actions.switchExercise(id));
    setShowResults(false);
    setManual('');
  }
  function setTrackedTimerPaused(paused: boolean) {
    manualTimerPause.current = paused;
    activityTracker.setPaused(paused);
  }
  function confirmReset() {
    const kind = resetKind;
    setResetKind(null);
    if (kind === 'session') {
      emitLearnEvent(sessionEventContext, { type: 'session_reset', itemId: sessionId || undefined });
      dispatch(actions.resetSession());
      setShowResults(false);
      setManual('');
    } else if (kind === 'all') {
      emitLearnEvent(sessionEventContext, { type: 'session_reset', itemId: sessionId || undefined, note: 'All local storage cleared.' });
      if (store.clearStorage) store.clearStorage();
      else clearAppStorage();
      window.location.reload();
    }
  }
  const diagnostic = useDiagnosticReport({
    showResults,
    exam,
    questionBank,
    state,
    sessionId,
    practiceAttemptCounts,
    dispatch,
    setManual,
  });
  return {
    ...bankSession,
    ...diagnostic,
    ...editor,
    ...review,
    ...transfer,
    ...lesson,
    ...sync,
    layout,
    editorRoot,
    modalOpenWithEditor,
    menu,
    batch,
    answeredCount,
    skippedCount,
    state,
    isMathAnswer,
    setMenu,
    menuInvoker,
    ex,
    syncPanelOpen,
    setup,
    backup,
    openInlinePanel,
    wellbeing,
    setResetKind,
    setShortcutsOpen,
    setCloudPreviewOpen,
    jsonForm,
    setActiveInspector,
    dispatch,
    driveBankInitialized,
    driveBankOpen,
    setDriveBankAvailable,
    cloudPreviewOpen,
    launcher,
    wide,
    setShowResults,
    switchQuestion,
    linkedLesson,
    fractions,
    exerciseIndex,
    guidanceOpen,
    setGuidanceOpen,
    manualTimerPause,
    activityTracker,
    answerType,
    answerChoices,
    copied,
    setManual,
    last,
    manual,
    showResults,
    exam,
    questionBank,
    lessonEventContext,
    matchingBank,
    currentBankQuestion,
    shortcutsOpen,
    resetKind,
    confirmReset,
    complete,
    setComplete,
  };
}
export type AppViewState = ReturnType<typeof useAppController>;
