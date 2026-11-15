import { useState } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { Button } from '../../shared/ui/button';
import { type Lesson } from './types';
import { contentDirection, displayEducationalHeading, languageForText, LessonSourceAttribution, LessonText } from './lesson-content';

export function LessonHeader({
  onBack,
  lesson,
  summary,
  practiceError,
  progressMessage,
  fa,
}: {
  onBack: () => void;
  lesson: Lesson;
  summary: boolean;
  practiceError?: string;
  progressMessage?: string;
  fa: boolean;
}) {
  const pages = lesson.pages?.replace(/(\d)\s*-\s*(\d)/, '$1–$2');
  const [lessonInfoOpen, setLessonInfoOpen] = useState(false);
  return (
    <header className="lesson-header">
      <Button variant="ghost" className="lesson-back" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        {fa ? 'بازگشت به تمرین' : 'Back to question'}
      </Button>
      <Button
        variant="ghost"
        className="lesson-info-toggle"
        aria-expanded={lessonInfoOpen}
        aria-controls="lesson-info-panel"
        onClick={() => setLessonInfoOpen((open) => !open)}
      >
        <span>
          {fa ? (lessonInfoOpen ? 'بستن اطلاعات درس' : 'اطلاعات درس') : lessonInfoOpen ? 'Hide lesson information' : 'Lesson information'}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={lessonInfoOpen ? 'lesson-info-chevron lesson-info-chevron-open' : 'lesson-info-chevron'}
        />
      </Button>
      <div id="lesson-info-panel" className={`lesson-info-panel${lessonInfoOpen ? '' : ' lesson-info-panel-collapsed'}`}>
        <p className="lesson-book-line" dir="ltr">
          <bdi>{lesson.book}</bdi> · {lesson.section}
          {pages && (
            <>
              {' '}
              · <bdi>pp. {pages}</bdi>
            </>
          )}
        </p>
        <LessonSourceAttribution book={lesson.book} section={lesson.section} />
      </div>
      <h1 lang={languageForText(lesson.title)} dir={contentDirection(lesson.title)}>
        <LessonText text={displayEducationalHeading(lesson.title)} />
      </h1>
      {summary && (
        <p className="lesson-progress" aria-live="polite">
          {fa ? 'جمع‌بندی درس' : 'Lesson summary'}
        </p>
      )}
      {practiceError && (
        <p className="lesson-practice-error" role="alert">
          {practiceError}
        </p>
      )}
      {progressMessage && (
        <p className="lesson-progress-message" role="alert">
          {progressMessage}
        </p>
      )}
    </header>
  );
}
