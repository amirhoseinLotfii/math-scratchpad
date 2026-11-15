import { Fragment, useEffect, useId, useState } from 'react';
import { Button } from '../../shared/ui/button';
import type { Concept, ExampleBlock, LessonBlock, Lang } from './types';

import {
  localizeLessonDigits,
  isRedundantOpeningHeading,
  LessonText,
  LessonMath,
  displayEducationalHeading,
  contentDirection,
  languageForText,
} from './lesson-content';
function LessonExample({
  block,
  blockKey,
  revealed,
  onReveal,
  uiLang,
}: {
  block: ExampleBlock;
  blockKey: string;
  revealed: number;
  onReveal: (value: number) => void;
  uiLang: Lang;
}) {
  const id = useId();
  const count = Math.min(block.steps.length, Math.max(0, revealed));
  const labels =
    uiLang === 'fa'
      ? {
          workedExample: 'مثال حل‌شده',
          tryFirst: 'ابتدا خودتان حل کنید',
          allShown: (n: number) => `هر ${localizeLessonDigits(n, uiLang)} گام نمایش داده شد`,
          someShown: (n: number, total: number) =>
            `${localizeLessonDigits(n, uiLang)} از ${localizeLessonDigits(total, uiLang)} گام نمایش داده شد`,
          step: 'گام',
          next: 'نمایش گام بعدی',
          all: 'نمایش همهٔ گام‌ها',
        }
      : {
          workedExample: 'Worked example',
          tryFirst: 'Try it yourself first',
          allShown: (n: number) => `All ${n} steps shown`,
          someShown: (n: number, total: number) => `${n} of ${total} steps shown`,
          step: 'Step',
          next: 'Show next step',
          all: 'Show all steps',
        };
  return (
    <section className="lesson-block lesson-example" aria-label={block.title || labels.workedExample}>
      {block.title && (
        <h4 lang={languageForText(block.title, block.lang)} dir={contentDirection(block.title, block.lang)}>
          <LessonText text={displayEducationalHeading(block.title, block.lang)} lang={block.lang} />
        </h4>
      )}
      {block.text && (
        <p lang={languageForText(block.text, block.lang)} dir={contentDirection(block.text, block.lang)}>
          <LessonText text={block.text} lang={block.lang} />
        </p>
      )}
      {block.latex && <LessonMath latex={block.latex} label={block.title || labels.workedExample} uiLang={uiLang} />}
      {block.steps.length > 0 && (
        <p className="lesson-example-progress" aria-live="polite">
          {count === 0
            ? labels.tryFirst
            : count === block.steps.length
              ? labels.allShown(count)
              : labels.someShown(count, block.steps.length)}
        </p>
      )}
      <div className="lesson-example-steps" id={`${id}-steps`}>
        {block.steps.slice(0, count).map((step, index) => (
          <div
            className={`lesson-example-step ${index === count - 1 ? 'is-latest' : ''}`}
            key={`${blockKey}-${index}`}
            aria-current={index === count - 1 ? 'step' : undefined}
          >
            <span className="lesson-example-step-label">
              {labels.step} {localizeLessonDigits(index + 1, uiLang)}
            </span>
            <p lang={languageForText(step, block.lang)} dir={contentDirection(step, block.lang)}>
              <LessonText text={step} lang={block.lang} />
            </p>
          </div>
        ))}
      </div>
      {count < block.steps.length && (
        <Button
          className="lesson-reveal-button"
          aria-expanded={count > 0}
          aria-controls={`${id}-steps`}
          onClick={() => onReveal(count + 1)}
        >
          {labels.next}
        </Button>
      )}
      {block.steps.length > 1 && count < block.steps.length && (
        <Button
          className="lesson-reveal-all"
          aria-expanded={count === block.steps.length}
          aria-controls={`${id}-steps`}
          onClick={() => onReveal(block.steps.length)}
        >
          {labels.all}
        </Button>
      )}
    </section>
  );
}

function LessonImage({ src, alt, caption, lang, uiLang }: { src: string; alt: string; caption?: string; lang?: Lang; uiLang: Lang }) {
  const [failed, setFailed] = useState(false);
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const unavailable = uiLang === 'fa' ? 'تصویر در دسترس نیست.' : 'Image unavailable.';
  const notCachedOffline = uiLang === 'fa' ? 'تصویر آفلاین ذخیره نشده.' : 'Image not saved offline.';
  const description = uiLang === 'fa' ? 'نمایش توضیح تصویر' : 'Show image description';
  useEffect(() => {
    const online = () => setOffline(false);
    const offline = () => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);
  const captionView = caption && (
    <figcaption className="lesson-image-caption" lang={languageForText(caption, lang)} dir={contentDirection(caption, lang)}>
      <LessonText text={caption} lang={lang} />
    </figcaption>
  );
  return failed ? (
    <figure className="lesson-image-fallback">
      <span className="lesson-image-fallback-label" role="status" lang={uiLang}>
        {unavailable}
        {offline && ` ${notCachedOffline}`}
      </span>
      {captionView}
      <figcaption>
        <details>
          <summary lang={uiLang}>{description}</summary>
          <p lang={languageForText(alt, lang)} dir={contentDirection(alt, lang)}>
            <LessonText text={alt} lang={lang} />
          </p>
        </details>
      </figcaption>
    </figure>
  ) : (
    <figure className="lesson-image-figure">
      <img className="lesson-image" src={src} alt={alt} lang={languageForText(alt, lang)} onError={() => setFailed(true)} />
      {captionView}
    </figure>
  );
}

export function LessonBlockView({
  block,
  blockKey,
  revealed,
  onReveal,
  uiLang = 'en',
}: {
  block: LessonBlock;
  blockKey: string;
  revealed: number;
  onReveal: (value: number) => void;
  uiLang?: Lang;
}) {
  const formula = (latex?: string) =>
    latex?.trim() ? (
      <div className="lesson-attached-formula" dir="ltr">
        <LessonMath latex={latex} label={uiLang === 'fa' ? 'فرمول همراه متن' : 'Text formula'} uiLang={uiLang} />
      </div>
    ) : null;
  if (block.type === 'heading')
    return (
      <div className="lesson-text-block">
        <h3 className="lesson-block-heading" lang={languageForText(block.text, block.lang)} dir={contentDirection(block.text, block.lang)}>
          <LessonText text={block.text} lang={block.lang} />
        </h3>
        {formula(block.latex)}
      </div>
    );
  if (block.type === 'paragraph')
    return (
      <div className="lesson-text-block">
        <p className="lesson-block-paragraph" lang={languageForText(block.text, block.lang)} dir={contentDirection(block.text, block.lang)}>
          <LessonText text={block.text} lang={block.lang} />
        </p>
        {formula(block.latex)}
      </div>
    );
  if (block.type === 'note')
    return (
      <aside
        className="lesson-block lesson-note"
        lang={languageForText(block.text, block.lang)}
        dir={contentDirection(block.text, block.lang)}
      >
        <p>
          <LessonText text={block.text} lang={block.lang} />
        </p>
        {formula(block.latex)}
      </aside>
    );
  if (block.type === 'definition')
    return (
      <section
        className="lesson-block lesson-definition"
        lang={languageForText(block.text, block.lang)}
        dir={contentDirection(block.text, block.lang)}
      >
        <h4>{uiLang === 'fa' ? 'تعریف' : 'Definition'}</h4>
        <p>
          <LessonText text={block.text} lang={block.lang} />
        </p>
        {block.latex && <LessonMath latex={block.latex} label={uiLang === 'fa' ? 'فرمول تعریف' : 'Definition formula'} uiLang={uiLang} />}
      </section>
    );
  if (block.type === 'example')
    return <LessonExample block={block} blockKey={blockKey} revealed={revealed} onReveal={onReveal} uiLang={uiLang} />;
  if (block.type === 'math')
    return block.text ? (
      <figure className="lesson-math-figure">
        <figcaption lang={languageForText(block.text, block.lang)} dir={contentDirection(block.text, block.lang)}>
          <LessonText text={block.text} lang={block.lang} />
        </figcaption>
        <LessonMath latex={block.latex} label={uiLang === 'fa' ? 'فرمول درس' : 'Lesson formula'} uiLang={uiLang} />
      </figure>
    ) : (
      <LessonMath latex={block.latex} label={uiLang === 'fa' ? 'فرمول درس' : 'Lesson formula'} uiLang={uiLang} />
    );
  if (block.type === 'image')
    return <LessonImage src={block.src} alt={block.alt} caption={block.caption} lang={block.lang} uiLang={uiLang} />;
  if (block.type === 'image-description')
    return (
      <figure className="lesson-image-fallback">
        <span className="lesson-image-fallback-label" role="status" lang={uiLang}>
          {uiLang === 'fa' ? 'تصویر در دسترس نیست.' : 'Image unavailable.'}
        </span>
        <figcaption>
          <details>
            <summary lang={uiLang}>{uiLang === 'fa' ? 'نمایش توضیح تصویر' : 'Show image description'}</summary>
            <p lang={languageForText(block.text, block.lang)} dir={contentDirection(block.text, block.lang)}>
              <LessonText text={block.text} lang={block.lang} />
            </p>
          </details>
        </figcaption>
      </figure>
    );
  if (block.type === 'unsupported')
    return (
      <aside className="lesson-unsupported" role="note">
        <p>
          {uiLang === 'fa'
            ? `محتوای این بخش (${block.originalType}) هنوز پشتیبانی نمی‌شود؛ دادهٔ اصلی در ادامه نمایش داده شده است.`
            : `Unsupported block: ${block.originalType}. Original content is shown as data.`}
        </p>
        {block.source && <pre dir="ltr">{block.source}</pre>}
      </aside>
    );
  return null;
}

export function LessonConceptContent({
  concept,
  revealedSteps,
  onReveal,
}: {
  concept: Concept;
  revealedSteps: Record<string, number>;
  onReveal: (key: string, value: number) => void;
}) {
  return (
    <div className="lesson-concept-blocks">
      {concept.blocks.map((block, index) => {
        if (isRedundantOpeningHeading(concept, block, index)) return null;
        const key = `${concept.id}:${index}`;
        return (
          <Fragment key={key}>
            <LessonBlockView block={block} blockKey={key} revealed={revealedSteps[key] ?? 0} onReveal={(value) => onReveal(key, value)} />
          </Fragment>
        );
      })}
    </div>
  );
}
