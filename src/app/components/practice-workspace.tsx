import { useState, type MutableRefObject } from 'react';
import { BookOpen } from 'lucide-react';
import type { DiagnosticQuestion } from '../../diagnostic';
import type { DiagnosticGrade } from '../../assessment';
import {
  mathfieldForStep,
  redoMathfield,
  undoMathfield,
} from '../../features/math-editor/mathlive-adapter';
import {
  contentDirection,
  languageForText,
  LessonSourceAttribution,
  LessonText,
  QuestionSource,
} from '../../features/lessons/lesson-content';
import type { Lesson } from '../../features/lessons/types';
import { MathTools } from '../../features/workspace/components/math-tools';
import { QuestionNavigator } from '../../features/workspace/components/question-navigator';
import { questionStatus, type WorkspaceLayout } from '../../features/workspace/model/workspace-layout';
import type { WorkspaceTemplate } from '../../features/workspace/model/workspace-templates';
import type { Exercise } from '../../model';
import { QuestionTimer } from '../../QuestionTimer';
import { Button } from '../../shared/ui/button';
import { actions, type AppDispatch, type ScratchState } from '../../store';
import { PracticeResponsePane } from './practice-response-pane';
import { PracticeReviewFooter } from './practice-review-footer';

export type Decision = 'next' | 'complete' | 'copy';

export function PracticeWorkspace({
  layout,
  wide,
  state,
  ex,
  exerciseIndex,
  batch,
  last,
  fractions,
  linkedLesson,
  lessonButtonRef,
  isMathAnswer,
  answerType,
  answerChoices,
  workspaceTemplate,
  onWorkspaceTemplateChange,
  copied,
  busy,
  manual,
  setManual,
  showResults,
  exam,
  examGrades,
  questionBankLength,
  dispatch,
  onSwitchQuestion,
  onOpenReference,
  onTimerPauseChange,
  onFocusEditor,
  onFocusCurrentMathControl,
  onAddStep,
  onResetStep,
  onDeleteStep,
  onInsert,
  onOpenInsert,
  onRequestDecision,
  onCopyReport,
}: {
  layout: WorkspaceLayout;
  wide: boolean;
  state: ScratchState;
  ex: Exercise;
  exerciseIndex: number;
  batch: boolean;
  last: boolean;
  fractions: boolean;
  linkedLesson: Lesson | undefined;
  lessonButtonRef: MutableRefObject<HTMLButtonElement | null>;
  isMathAnswer: boolean;
  answerType: string;
  answerChoices: string[];
  workspaceTemplate: WorkspaceTemplate;
  onWorkspaceTemplateChange: (template: WorkspaceTemplate) => void;
  copied: string;
  busy: boolean;
  manual: string;
  setManual: (text: string) => void;
  showResults: boolean;
  exam: boolean;
  examGrades: Array<{ question: DiagnosticQuestion; result: DiagnosticGrade | null }>;
  questionBankLength: number;
  dispatch: AppDispatch;
  onSwitchQuestion: (id: string) => void;
  onOpenReference: (lesson: Lesson) => void;
  onTimerPauseChange: (paused: boolean) => void;
  onFocusEditor: () => void;
  onFocusCurrentMathControl: () => void;
  onAddStep: () => void;
  onResetStep: (id: string) => void;
  onDeleteStep: (id: string) => void;
  onInsert: (kind: string) => void;
  onOpenInsert: (source?: HTMLElement) => void;
  onRequestDecision: (action: Decision) => void;
  onCopyReport: () => void;
}) {
  const [guidanceOpen, setGuidanceOpen] = useState(false);

  const activeMathfield = mathfieldForStep(state.doc.cursor.stepId);
  const canUndo = !!activeMathfield?.canUndo() || state.past.some(d => d.exerciseId === ex.id);
  const canRedo = !!activeMathfield?.canRedo() || state.future.some(d => d.exerciseId === ex.id);

  const mathTools = (
    <MathTools
      wide={wide}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={() => {
        if (!undoMathfield(state.doc.cursor.stepId)) dispatch(actions.undo());
        onFocusEditor();
      }}
      onRedo={() => {
        if (!redoMathfield(state.doc.cursor.stepId)) dispatch(actions.redo());
        onFocusEditor();
      }}
      onInsert={onInsert}
      onMore={onOpenInsert}
      workspaceTemplate={workspaceTemplate}
      onWorkspaceTemplateChange={onWorkspaceTemplateChange}
    />
  );

  return (
    <div className="workspace">
      {layout !== 'phone' && batch && (
        <QuestionNavigator doc={state.doc} onSelect={onSwitchQuestion} />
      )}
      <div
        className="question-context"
        role={wide ? 'region' : undefined}
        aria-label={wide ? 'Question context' : undefined}
      >
        {batch && (
          <section
            className="exercise-bar"
            hidden={layout !== 'phone'}
            aria-label="Question navigation"
          >
            <label>
              Current question
              <select
                aria-label="Select question"
                value={ex.id}
                onChange={e => onSwitchQuestion(e.target.value)}
              >
                {state.doc.exercises.map((entry, i) => (
                  <option value={entry.id} key={entry.id}>
                    Question {i + 1} · {questionStatus(entry)}
                  </option>
                ))}
              </select>
            </label>
          </section>
        )}
        <section className="problem" aria-label="Current problem">
          {(wide || linkedLesson || fractions) && (
            <div className="question-heading">
              <h2>Question {exerciseIndex + 1}</h2>
              {fractions && <span className="topic-badge">Fractions</span>}
              {linkedLesson && (
                <Button
                  ref={lessonButtonRef}
                  className="lesson-reference-trigger"
                  onClick={() => onOpenReference(linkedLesson)}
                >
                  <BookOpen aria-hidden="true" />
                  Lesson
                </Button>
              )}
            </div>
          )}
          {ex.prompt && (
            <p
              className="question-statement"
              lang={languageForText(ex.prompt)}
              dir={contentDirection(ex.prompt)}
            >
              <LessonText text={ex.prompt} />
            </p>
          )}
          {(ex.mode === 'math' ||
            (ex.source.trim() && ex.source.trim() !== ex.prompt?.trim())) && (
            <QuestionSource
              source={ex.source}
              mode={ex.mode}
              label="Original problem"
              mathLabel="Original question expression"
              textClassName="question-source-text"
              mathClassName="problem-formula"
            />
          )}
          {ex.guidance && (
            <details
              className="question-guidance"
              open={guidanceOpen}
              onToggle={e => {
                const open = e.currentTarget.open;
                if (open !== guidanceOpen) setGuidanceOpen(open);
                if (open) dispatch(actions.openGuidance());
              }}
            >
              <summary>
                Question guidance
                {ex.guidanceOpenedAt ? (
                  <span className="small guidance-used"> · Used</span>
                ) : null}
              </summary>
              <p lang={languageForText(ex.guidance)} dir={contentDirection(ex.guidance)}>
                <LessonText text={ex.guidance} />
              </p>
            </details>
          )}
          {linkedLesson && (
            <LessonSourceAttribution book={linkedLesson.book} section={linkedLesson.section} />
          )}
        </section>
        <QuestionTimer key={ex.id} exerciseId={ex.id} onPauseChange={onTimerPauseChange} />
      </div>
      <div
        className={`editor-layout work-pane ${
          isMathAnswer && state.keyboardOpen ? 'keyboard-visible' : 'keyboard-hidden'
        }`}
        role={wide ? 'region' : undefined}
        aria-label={wide ? (isMathAnswer ? 'Your work' : 'Your response') : undefined}
      >
        <div className="notebook-main">
          <PracticeResponsePane
            wide={wide}
            state={state}
            ex={ex}
            isMathAnswer={isMathAnswer}
            answerType={answerType}
            answerChoices={answerChoices}
            mathTools={mathTools}
            dispatch={dispatch}
            onFocusEditor={onFocusEditor}
            onFocusCurrentMathControl={onFocusCurrentMathControl}
            onAddStep={onAddStep}
            onResetStep={onResetStep}
            onDeleteStep={onDeleteStep}
            onOpenInsert={onOpenInsert}
          />
          <PracticeReviewFooter
            wide={wide}
            batch={batch}
            busy={busy}
            copied={copied}
            notice={state.notice}
            exerciseIndex={exerciseIndex}
            last={last}
            skipped={!!ex.skipped}
            storageError={
              state.storageState?.kind === 'error' ? state.storageState.message : undefined
            }
            manual={manual}
            setManual={setManual}
            showResults={showResults}
            exam={exam}
            examGrades={examGrades}
            questionBankLength={questionBankLength}
            onPreviousQuestion={() => {
              dispatch(actions.adjacentExercise(-1));
              setManual('');
            }}
            onRequestDecision={onRequestDecision}
            onCopyReport={onCopyReport}
          />
        </div>
      </div>
    </div>
  );
}
