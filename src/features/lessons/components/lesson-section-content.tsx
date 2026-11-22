import { useCallback, type ReactNode } from 'react';
import type { BankQuestion } from '../../../domain/entities/drive-bank.types';
import { MathDisplay } from '../../../shared/ui/math-display';
import type { Step } from '../../math-editor/model/model';
import type { ScratchStore } from '../../math-editor/store/editor-store';
import { conceptAnchorId } from '../../progress/reading-position-anchors';
import { contentDirection, displayEducationalHeading, isRedundantOpeningHeading, languageForText, LessonBlockView, LessonText, localizeLessonDigits } from '../lesson-content';
import { LessonMathCheck } from '../lesson-math-check';
import type { LessonSection } from '../lesson-sections';
import type { LessonWorkItem } from '../lesson-work-items';

export function LessonSectionContent({
  section,
  onReveal,
  revealedSteps,
  uiLang,
  hideSingleConceptHeading = false,
  renderExampleWork,
}: {
  section: LessonSection;
  onReveal: (key: string, value: number) => void;
  revealedSteps: Record<string, number>;
  uiLang: 'fa' | 'en';
  hideSingleConceptHeading?: boolean;
  renderExampleWork?: (blockKey: string) => ReactNode;
}) {
  return (
    <div className="lesson-section-content">
      {section.concepts.map(({ concept, conceptIndex, blocks }) => {
        const content = (
          <div className="lesson-concept-blocks">
            {blocks.map((block, blockIndex) => {
              const originalIndex = concept.blocks.indexOf(block);
              if (isRedundantOpeningHeading(concept, block, originalIndex)) return null;
              const key = `${concept.id}:${originalIndex >= 0 ? originalIndex : blockIndex}`;
              const view = (
                <LessonBlockView
                  block={block}
                  blockKey={key}
                  revealed={revealedSteps[key] ?? 0}
                  onReveal={value => onReveal(key, value)}
                  uiLang={uiLang}
                />
              );
              return block.type === 'example' && renderExampleWork
                ? <div key={key} className="lesson-example-with-work">{view}{renderExampleWork(key)}</div>
                : <LessonBlockView key={key} block={block} blockKey={key} revealed={revealedSteps[key] ?? 0} onReveal={value => onReveal(key, value)} uiLang={uiLang} />;
            })}
          </div>
        );
        if (hideSingleConceptHeading && section.concepts.length === 1) {
          return <div className="lesson-section-concept" key={concept.id} data-anchor-id={conceptAnchorId(concept.id)}>{content}</div>;
        }
        return (
          <section className="lesson-section-concept" key={concept.id} data-anchor-id={conceptAnchorId(concept.id)} aria-labelledby={`lesson-section-concept-${concept.id}`}>
            <p className="lesson-section-concept-label">{uiLang === 'fa' ? 'مفهوم' : 'Concept'} {localizeLessonDigits(conceptIndex + 1, uiLang)}</p>
            <h3 id={`lesson-section-concept-${concept.id}`} lang={languageForText(concept.title)} dir={contentDirection(concept.title)}>
              <LessonText text={displayEducationalHeading(concept.title)} />
            </h3>
            {content}
          </section>
        );
      })}
    </div>
  );
}

export function InlineExampleEditor({
  item,
  uiLang,
  getWorkStore,
  onWork,
}: {
  item: LessonWorkItem;
  uiLang: 'fa' | 'en';
  getWorkStore: (item: LessonWorkItem) => ScratchStore;
  onWork: (key: string, answer: { type: 'math'; steps: Step[] }) => void;
}) {
  const onAnswered = useCallback((_: string, answer: { type: 'math'; steps: Step[] }) => onWork(item.key, answer), [item.key, onWork]);
  return <LessonMathCheck question={item.workQuestion} store={getWorkStore(item)} onAnswered={onAnswered} uiLang={uiLang} />;
}

export function ReviewQuestionContent({ question }: { question: BankQuestion }) {
  if (question.prompt) return <span lang={languageForText(question.prompt)} dir={contentDirection(question.prompt)}><LessonText text={question.prompt} /></span>;
  if (question.mode === 'math') return <bdi dir="ltr"><MathDisplay latex={question.source} label="Question expression" display={false} /></bdi>;
  return <span lang={languageForText(question.source)} dir={contentDirection(question.source)}><LessonText text={question.source} /></span>;
}
