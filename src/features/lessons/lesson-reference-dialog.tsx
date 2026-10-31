import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../shared/ui/dialog';
import { Button } from '../../shared/ui/button';
import type { BankQuestion } from '../drive-bank/drive-bank';
import { getLearnChecks } from './selectors';
import type { DriveBank } from '../drive-bank/drive-bank';
import type { Lesson } from './types';
import { contentDirection, displayEducationalHeading, isRedundantOpeningHeading, languageForText, LessonBlockView, LessonSourceAttribution, LessonText, QuestionSource } from './lesson-content';

function ReadOnlyQuestion({ question }: { question: BankQuestion }) {
  return <article className="lesson-reference-check">
    <h4>Check · {question.id}</h4>
    {question.prompt && <p lang={languageForText(question.prompt)} dir={contentDirection(question.prompt)}><LessonText text={question.prompt} /></p>}
    <QuestionSource source={question.source} mode={question.mode} label="Question expression" textClassName="lesson-check-source-text" mathClassName="lesson-check-source" />
    {question.answerType === 'choice' && question.choices && <ul className="lesson-reference-choices" dir="ltr" aria-label="Available options">{question.choices.map((choice, index) => <li key={`${question.id}-${index}`}>{choice}</li>)}</ul>}
  </article>;
}

export function LessonReferenceDialog({ lesson, bank, onOpenChange, onCloseAutoFocus }: {
  lesson: Lesson | null;
  bank: DriveBank;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return <Dialog open={!!lesson} onOpenChange={onOpenChange}>
    <DialogContent className="lesson-reference-dialog" aria-describedby="lesson-reference-description" onCloseAutoFocus={onCloseAutoFocus}>
      {lesson && <>
        <DialogTitle lang={languageForText(lesson.title)} dir={contentDirection(lesson.title)}><LessonText text={displayEducationalHeading(lesson.title)} /></DialogTitle>
        <p className="lesson-reference-metadata" dir="ltr">{lesson.book} · {lesson.section}{lesson.pages ? ` · pp. ${lesson.pages}` : ''}</p>
        <LessonSourceAttribution book={lesson.book} />
        <DialogDescription id="lesson-reference-description">Read-only lesson reference. Checks cannot be answered here.</DialogDescription>
        <div className="lesson-reference-content" role="region" aria-label="Lesson content" tabIndex={0}>
          {lesson.concepts.map((concept, conceptIndex) => <section className="lesson-reference-concept" key={concept.id} aria-labelledby={`reference-concept-${concept.id}`}>
            <p className="lesson-section-label">Concept {conceptIndex + 1}</p>
            <h2 id={`reference-concept-${concept.id}`} lang={languageForText(concept.title)} dir={contentDirection(concept.title)}><LessonText text={displayEducationalHeading(concept.title)} /></h2>
            <div className="lesson-concept-blocks">
              {concept.blocks.map((block, index) => isRedundantOpeningHeading(concept, block, index) ? null : <LessonBlockView
                key={`${concept.id}:${index}`}
                block={block}
                blockKey={`${concept.id}:${index}`}
                revealed={block.type === 'example' ? block.steps.length : 0}
                onReveal={() => undefined}
              />)}
            </div>
            {getLearnChecks(bank, concept.id).length > 0 && <section className="lesson-reference-checks" aria-label={`Checks for ${concept.title}`}>
              <h3>Checks</h3>
              {getLearnChecks(bank, concept.id).map(question => <ReadOnlyQuestion key={question.id} question={question} />)}
            </section>}
          </section>)}
        </div>
        <div className="dialog-actions"><Button onClick={() => onOpenChange(false)}>Back to question</Button></div>
      </>}
    </DialogContent>
  </Dialog>;
}
