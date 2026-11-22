import { useEffect, useRef, useState } from 'react';
import type { DriveBank } from '../../features/drive-bank/drive-bank';
import { getConfig as getDriveConfig } from '../../auth/google';
import { getLesson } from '../../features/lessons/selectors';
import { questionStatus } from '../../features/workspace/model/workspace-layout';
import { useAppDispatch, useAppSelector, useAppStore } from '../../hooks';
import { example, isoLocal } from '../../model';
import { fingerprint } from '../../review';
import { useWorkspaceLayout } from '../../shared/hooks/use-workspace-layout';
import { actions, exerciseOf } from '../../store';
import { usePracticeLauncher } from '../practice-launcher';
import { useBankSession } from '../use-bank-session';
import { usePracticeEditEvents } from '../use-practice-edit-events';
import { useWellbeing } from '../use-wellbeing';
import { useAppDecision } from './use-app-decision';
import { useAppShellEffects } from './use-app-shell-effects';
import { useAppShortcuts } from './use-app-shortcuts';
import { useAppTelemetry } from './use-app-telemetry';
import { useLessonOrchestration } from './use-lesson-orchestration';
import { useReviewCopy } from './use-review-copy';
import { useServerConflict } from './use-server-conflict';
import { useSessionImport } from './use-session-import';
import { useWorkspaceTemplate } from './use-workspace-template';

export function useAppController(initialBank?: { bank: DriveBank; version: string }) {
  const layout = useWorkspaceLayout();
  const wide = layout !== 'phone';
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [cloudPreviewOpen, setCloudPreviewOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [activeInspector, setActiveInspector] = useState<'drive' | 'sync' | null>(null);
  const driveBankOpen = activeInspector === 'drive';
  const syncPanelOpen = activeInspector === 'sync';
  const [driveBankInitialized, setDriveBankInitialized] = useState(() => !!getDriveConfig().fileId);
  const [, setDriveBankAvailable] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [manualPlaceholder, setManualPlaceholder] = useState('');

  const menuInvoker = useRef<HTMLButtonElement>(null);
  const lessonButton = useRef<HTMLButtonElement>(null);
  const editorRoot = useRef<HTMLElement>(null);
  const timerPauseDelegateRef = useRef<(paused: boolean) => void>(() => {});
  const completeDelegateRef = useRef<(value: boolean) => void>(() => {});

  const state = useAppSelector(s => s);
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const ex = exerciseOf(state.doc);
  const exerciseIndex = state.doc.exercises.findIndex(x => x.id === ex.id);

  const { workspaceTemplate, changeWorkspaceTemplate } = useWorkspaceTemplate(
    state.doc.session?.bankId,
    state.doc.session?.chapter
  );
  const serverConflictState = useServerConflict();
  const launcher = usePracticeLauncher();
  const { setup, backup, confirmExam, confirmFractions, jsonForm, openInlinePanel } = launcher;

  const bankSession = useBankSession({
    initialBank,
    store,
    setTimerPaused: paused => timerPauseDelegateRef.current(paused),
  });
  const { loadedBank, loadedBankRef, lessonProgressRef } = bankSession;

  const matchingBank =
    loadedBank &&
    state.doc.session?.bankId === loadedBank.bank.bank_id &&
    state.doc.session?.bankVersion === loadedBank.version
      ? loadedBank
      : null;
  const currentBankQuestion =
    matchingBank && ex.bankQuestionId
      ? matchingBank.bank.questions.find(q => q.id === ex.bankQuestionId)
      : undefined;
  const answerType =
    ex.answerType ??
    currentBankQuestion?.answerType ??
    (currentBankQuestion?.mode === 'text' ? 'text' : 'math');
  const answerChoices = ex.choices ?? currentBankQuestion?.choices ?? [];
  const isMathAnswer = answerType === 'math';
  const linkedLesson =
    currentBankQuestion?.stage !== 'learn'
      ? getLesson(matchingBank?.bank ?? {}, currentBankQuestion?.lessonId)
      : undefined;

  const telemetry = useAppTelemetry({
    state,
    store,
    ex,
    loadedBank,
    matchingBank,
    currentBankQuestion,
    answerType,
    lessonScreenId: undefined,
    hasReferenceLesson: false,
    showResults,
    setManual: text => setManualPlaceholder(text),
  });
  timerPauseDelegateRef.current = telemetry.setTrackedTimerPaused;

  const reviewCopy = useReviewCopy({
    store,
    loadedBank,
    lessonProgressRef,
    sessionEventContext: telemetry.sessionEventContext,
    sessionId: telemetry.sessionId,
    onFallbackBackupJson: text => {
      jsonForm.reset({ json: text });
      openInlinePanel('backup');
    },
  });
  useEffect(() => {
    if (manualPlaceholder) {
      reviewCopy.setManual(manualPlaceholder);
      setManualPlaceholder('');
    }
  }, [manualPlaceholder, reviewCopy]);

  function switchQuestion(id: string) {
    dispatch(actions.switchExercise(id));
    setShowResults(false);
    reviewCopy.setManual('');
  }

  const lessonOrch = useLessonOrchestration({
    store,
    loadedBank,
    matchingBank,
    currentBankQuestion,
    lessonProgressById: bankSession.lessonProgressById,
    lessonProgressRef,
    updateLessonProgressState: bankSession.updateLessonProgressState,
    rememberLessonProgress: bankSession.rememberLessonProgress,
    activityTracker: telemetry.activityTracker,
    sessionId: telemetry.sessionId,
    exam: telemetry.exam,
    menuInvoker,
    setActiveInspector,
    onSwitchQuestion: switchQuestion,
    onResetPracticeView: () => {
      setShowResults(false);
      reviewCopy.setManual('');
      completeDelegateRef.current(false);
    },
  });

  const decisionState = useAppDecision({
    ex,
    store,
    dispatch,
    sessionEventContext: telemetry.sessionEventContext,
    sessionId: telemetry.sessionId,
    recordPracticeAttempt: telemetry.recordPracticeAttempt,
    markLessonPracticeDone: lessonOrch.markLessonPracticeDone,
    copyReview: reviewCopy.copyReview,
    setManual: reviewCopy.setManual,
    setShowResults,
  });
  completeDelegateRef.current = decisionState.setComplete;

  usePracticeEditEvents(store, loadedBankRef);
  const multipleQuestions = state.doc.exercises.length > 1;
  const wellbeing = useWellbeing({
    multipleQuestions,
    sessionId: telemetry.sessionId,
    session: state.doc.session,
    storageConflict: state.storageState?.kind === 'conflict' || !!serverConflictState.serverConflict,
  });

  const sessionImport = useSessionImport({
    state,
    store,
    sessionEventContext: telemetry.sessionEventContext,
    onImported: () => {
      setShowResults(false);
      jsonForm.reset({ json: '' });
      openInlinePanel('backup');
    },
  });

  const shortcuts = useAppShortcuts({
    store,
    ex,
    editorRoot,
    chapterTransitioning: bankSession.chapterTransitioning,
    bankTransitionRef: bankSession.bankTransitionRef,
    modalOpen: false,
    inlinePanelActive: Boolean(setup || backup || confirmExam || confirmFractions),
  });

  const modalOpen =
    wellbeing.askWellbeing ||
    shortcutsOpen ||
    !!reviewCopy.exportWarning ||
    !!decisionState.resetKind ||
    cloudPreviewOpen ||
    shortcuts.insertOpen ||
    !!decisionState.decision ||
    decisionState.complete ||
    lessonOrch.lessonPickerOpen ||
    !!lessonOrch.referenceLesson ||
    state.storageState?.kind === 'conflict' ||
    !!serverConflictState.serverConflict;

  const { syncRuntime, syncStatus } = useAppShellEffects({
    menu,
    modalOpen,
    driveBankOpen,
    syncPanelOpen,
    hasLessonScreen: !!lessonOrch.lessonScreen,
    exId: ex.id,
    editorRoot,
  });

  const answeredCount = state.doc.exercises.filter(x => questionStatus(x) === 'Answered').length;
  const skippedCount = state.doc.exercises.filter(x => x.skipped).length;
  const copied = !state.copies[ex.id]
    ? ''
    : state.copies[ex.id] === fingerprint(state.doc)
      ? 'Copied'
      : 'Changed since copy';
  const batch = multipleQuestions || !!lessonOrch.activePracticeLessonId;
  const last = exerciseIndex === state.doc.exercises.length - 1;
  const openDriveBank = () => {
    setDriveBankInitialized(true);
    setActiveInspector('drive');
  };

  const menuActions = {
    onCheckCopy: () => decisionState.request('copy'),
    onExportTutor: () => { void reviewCopy.exportTutor(); },
    onOpenDriveBank: openDriveBank,
    onNewProblem: () => openInlinePanel('new'),
    onToggleSkip: () => dispatch(actions.setSkipped(!ex.skipped)),
    onLessons: () => lessonOrch.setLessonPickerOpen(true),
    onEditScales: wellbeing.editScales,
    onEndSession: () => dispatch(actions.setSessionMeta({ endedAt: isoLocal() })),
    onResetSession: () => decisionState.setResetKind('session'),
    onShortcuts: () => setShortcutsOpen(true),
    onCloudPreview: () => setCloudPreviewOpen(true),
    onResetAll: () => decisionState.setResetKind('all'),
    onStartFractions: () => openInlinePanel('fractions'),
    onStartDiagnostic: () => openInlinePanel('diagnostic'),
    onUseExample: () => dispatch(actions.command({ type: 'newExercise', source: example, mode: 'math' })),
    onUseCurrentExpression: () => dispatch(actions.command({ type: 'newProblem' })),
    onCopySession: () => { void reviewCopy.copySession(); },
    onDownloadBackup: reviewCopy.downloadBackup,
    onImportFile: () => sessionImport.fileInput.current?.click(),
    onImportJson: () => { jsonForm.reset({ json: '' }); openInlinePanel('backup'); },
    onOpenSync: () => setActiveInspector('sync'),
  };

  return {
    layout, wide, state, dispatch, ex, exerciseIndex, batch, last, answeredCount, skippedCount, copied,
    shortcutsOpen, setShortcutsOpen, cloudPreviewOpen, setCloudPreviewOpen,
    menu, setMenu, activeInspector, setActiveInspector, driveBankOpen, syncPanelOpen,
    driveBankInitialized, setDriveBankAvailable, showResults, setShowResults,
    menuInvoker, lessonButton, editorRoot, workspaceTemplate, changeWorkspaceTemplate,
    serverConflictState, launcher, bankSession, matchingBank, currentBankQuestion,
    answerType, answerChoices, isMathAnswer, linkedLesson,
    telemetry, reviewCopy, lessonOrch, wellbeing, sessionImport, shortcuts,
    modalOpen, syncRuntime, syncStatus, switchQuestion, openDriveBank, menuActions,
    ...decisionState,
  };
}
