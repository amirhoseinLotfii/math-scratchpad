import { BookOpen } from 'lucide-react';
import { actions } from '../store';
import { QuestionTimer } from '../features/session/components/question-timer';
import { Button } from '../shared/ui/button';

import { useWorkspaceLayout } from '../shared/hooks/use-workspace-layout';
import { questionStatus } from '../features/workspace/model/workspace-layout';
import { contentDirection, languageForText, LessonSourceAttribution, LessonText, QuestionSource } from '../features/lessons/lesson-content';
import { ActivityTracker } from '../sync/activity-tracker';

import type { AppDispatch, ScratchState } from '../store';
import type { Exercise } from '../model';
import type { Lesson } from '../features/lessons/types';
import type { RefObject, Dispatch, SetStateAction } from 'react';

type Props = {
  wide: boolean;
  batch: boolean;
  layout: ReturnType<typeof useWorkspaceLayout>;
  ex: Exercise;
  state: ScratchState;
  switchQuestion: (id: string) => void;
  linkedLesson?: Lesson;
  fractions: boolean;
  exerciseIndex: number;
  lessonButton: RefObject<HTMLButtonElement | null>;
  openReference: (lesson: Lesson) => void;
  guidanceOpen: boolean;
  setGuidanceOpen: Dispatch<SetStateAction<boolean>>;
  dispatch: AppDispatch;
  manualTimerPause: RefObject<boolean>;
  activityTracker: ActivityTracker;
};
export function QuestionContext({
  wide,
  batch,
  layout,
  ex,
  state,
  switchQuestion,
  linkedLesson,
  fractions,
  exerciseIndex,
  lessonButton,
  openReference,
  guidanceOpen,
  setGuidanceOpen,
  dispatch,
  manualTimerPause,
  activityTracker,
}: Props) {
  return (
    <div className="question-context" role={wide ? 'region' : undefined} aria-label={wide ? 'Question context' : undefined}>
      {batch && (
        <section className="exercise-bar" hidden={layout !== 'phone'} aria-label="Question navigation">
          <label>
            Current question
            <select aria-label="Select question" value={ex.id} onChange={(e) => switchQuestion(e.target.value)}>
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
              <Button ref={lessonButton} className="lesson-reference-trigger" onClick={() => openReference(linkedLesson)}>
                <BookOpen aria-hidden="true" />
                Lesson
              </Button>
            )}
          </div>
        )}
        {ex.prompt && (
          <p className="question-statement" lang={languageForText(ex.prompt)} dir={contentDirection(ex.prompt)}>
            <LessonText text={ex.prompt} />
          </p>
        )}
        {(ex.mode === 'math' || (ex.source.trim() && ex.source.trim() !== ex.prompt?.trim())) && (
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
            onToggle={(e) => {
              const open = e.currentTarget.open;
              if (open !== guidanceOpen) setGuidanceOpen(open);
              if (open) dispatch(actions.openGuidance());
            }}
          >
            <summary>Question guidance{ex.guidanceOpenedAt ? <span className="small guidance-used"> · Used</span> : null}</summary>
            <p lang={languageForText(ex.guidance)} dir={contentDirection(ex.guidance)}>
              <LessonText text={ex.guidance} />
            </p>
          </details>
        )}
        {linkedLesson && <LessonSourceAttribution book={linkedLesson.book} section={linkedLesson.section} />}
      </section>
      <QuestionTimer
        key={ex.id}
        exerciseId={ex.id}
        onPauseChange={(paused) => {
          manualTimerPause.current = paused;
          activityTracker.setPaused(paused);
        }}
      />
    </div>
  );
}
