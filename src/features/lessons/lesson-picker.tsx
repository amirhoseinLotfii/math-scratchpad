import { BookOpen } from 'lucide-react';
import { Button } from '../../shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../shared/ui/dialog';
import type { Lesson, LessonProgress, LessonStatus } from './types';

const statusLabel: Record<LessonStatus | 'not_started', string> = {
  not_started: 'Not started',
  learning: 'Learning',
  practising: 'Practising',
  done: 'Done',
};

export function LessonPicker({ open, lessons, progressByLesson, onOpenChange, onChoose, onCloseAutoFocus }: {
  open: boolean;
  lessons: Lesson[];
  progressByLesson: Record<string, LessonProgress | undefined>;
  onOpenChange: (open: boolean) => void;
  onChoose: (lesson: Lesson) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const groups = new Map<string, Lesson[]>();
  lessons.forEach(lesson => {
    const key = `${lesson.book}\u0000${lesson.section}`;
    groups.set(key, [...(groups.get(key) ?? []), lesson]);
  });

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="lesson-picker-dialog" onCloseAutoFocus={onCloseAutoFocus}>
      <DialogTitle>Lessons</DialogTitle>
      <DialogDescription>Choose a lesson to learn or review before practice.</DialogDescription>
      {lessons.length === 0 ? <p className="lesson-picker-empty" role="status">No lessons in this bank</p> : <div className="lesson-picker-groups">
        {Array.from(groups, ([key, entries], groupIndex) => {
          const [book, section] = key.split('\u0000');
          return <section className="lesson-picker-group" key={key} aria-labelledby={`lesson-group-${groupIndex}`}>
            <h3 id={`lesson-group-${groupIndex}`}><span dir="ltr">{book} · {section}</span></h3>
            <ul>{entries.map(lesson => {
              const status = progressByLesson[lesson.id]?.status ?? 'not_started';
              return <li key={lesson.id}>
                <Button className="lesson-picker-item" onClick={() => onChoose(lesson)}>
                  <BookOpen aria-hidden="true" />
                  <span className="lesson-picker-title" dir="auto">{lesson.title}</span>
                  <span className={`lesson-status lesson-status-${status}`} aria-label={`Status: ${statusLabel[status]}`}>{statusLabel[status]}</span>
                </Button>
              </li>;
            })}</ul>
          </section>;
        })}
      </div>}
      <div className="dialog-actions"><Button onClick={() => onOpenChange(false)}>Close</Button></div>
    </DialogContent>
  </Dialog>;
}
