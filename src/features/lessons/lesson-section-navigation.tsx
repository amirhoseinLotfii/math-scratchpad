import { Button } from '../../shared/ui/button';
import { localizeLessonDigits } from './lesson-content';

export function LessonSectionNavigation({
  fa,
  sectionIndex,
  conceptComplete,
  goPrevious,
  goNext,
}: {
  fa: boolean;
  sectionIndex: number;
  conceptComplete: boolean;
  goPrevious: () => void;
  goNext: () => void;
}) {
  return (
    <nav className="lesson-concept-navigation" aria-label={fa ? 'پیمایش بخش‌های درس' : 'Lesson section navigation'}>
      <Button onClick={goPrevious} disabled={sectionIndex === 0}>
        {fa ? '→ بخش قبلی' : '← Previous section'}
      </Button>
      <Button className="lesson-primary-action" onClick={goNext} disabled={!conceptComplete}>
        {fa ? 'بخش بعدی ←' : 'Next section →'}
      </Button>
    </nav>
  );
}
export function LessonGateHint({ fa, uiLang, remaining }: { fa: boolean; uiLang: 'fa' | 'en'; remaining: number }) {
  return (
    <p className="lesson-next-hint" role="status">
      {fa
        ? `برای فعال شدن «بخش بعدی»، ${localizeLessonDigits(remaining, uiLang)} تمرین کوتاه باقی‌مانده را پاسخ بده یا رد کن.`
        : `Answer or skip the ${remaining} remaining quick check(s) to unlock the next section.`}
    </p>
  );
}
