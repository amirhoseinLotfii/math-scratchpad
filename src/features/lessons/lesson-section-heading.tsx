import { contentDirection, displayEducationalHeading, languageForText, LessonText, localizeLessonDigits } from './lesson-content';

import type { RefObject } from 'react';
import type { LessonSection } from './lesson-sections';
export type { LessonRestoreTarget } from './lesson-screen-types';

export function LessonSectionHeading({
  fa,
  uiLang,
  sectionIndex,
  sectionCount,
  currentSectionPages,
  currentSection,
  headingRef,
}: {
  fa: boolean;
  uiLang: 'fa' | 'en';
  sectionIndex: number;
  sectionCount: number;
  currentSectionPages: string;
  currentSection: LessonSection;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <>
      {' '}
      <div className="lesson-concept-heading" aria-live="polite">
        <p className="lesson-section-label">
          {fa ? 'بخش' : 'Section'} {localizeLessonDigits(sectionIndex + 1, uiLang)} {fa ? 'از' : 'of'}{' '}
          {localizeLessonDigits(sectionCount, uiLang)}
        </p>
        {currentSectionPages && (
          <span className="lesson-pages">
            {fa ? 'صفحه‌های' : 'Pages'} {currentSectionPages}
          </span>
        )}
      </div>
      <h2
        id="lesson-concept-title"
        ref={headingRef}
        tabIndex={-1}
        lang={
          currentSection.title
            ? languageForText(currentSection.title)
            : currentSection.concepts.length === 1
              ? languageForText(currentSection.concepts[0].concept.title)
              : uiLang
        }
        dir={
          currentSection.title
            ? contentDirection(currentSection.title)
            : currentSection.concepts.length === 1
              ? contentDirection(currentSection.concepts[0].concept.title)
              : fa
                ? 'rtl'
                : 'ltr'
        }
      >
        {currentSection.title ? (
          <LessonText text={displayEducationalHeading(currentSection.title)} />
        ) : currentSection.concepts.length === 1 ? (
          <LessonText text={displayEducationalHeading(currentSection.concepts[0].concept.title)} />
        ) : fa ? (
          'درس این بخش'
        ) : (
          'This section'
        )}
      </h2>
    </>
  );
}
