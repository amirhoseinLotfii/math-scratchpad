import { useEffect, useRef } from 'react';
import { Button } from '../../../shared/ui/button';

export function LessonAvailability({ loading, onBack }: { loading: boolean; onBack: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); }, [loading]);
  return (
    <section className={`lesson-state ${loading ? 'lesson-state-loading' : 'lesson-state-error'}`} aria-labelledby="lesson-state-title" aria-busy={loading}>
      {loading ? (
        <>
          <p className="lesson-section-label">Lessons</p>
          <h1 id="lesson-state-title" ref={titleRef} tabIndex={-1}>Loading lesson…</h1>
          <div className="lesson-skeleton" aria-hidden="true"><span /><span /><span /></div>
          <p role="status" aria-live="polite">Loading lesson…</p>
        </>
      ) : (
        <>
          <p className="lesson-section-label">Lessons</p>
          <h1 id="lesson-state-title" ref={titleRef} tabIndex={-1}>Lesson unavailable</h1>
          <p role="alert">This lesson data is unavailable. You can continue with the questions.</p>
          <Button onClick={onBack}>Back to question</Button>
        </>
      )}
    </section>
  );
}
