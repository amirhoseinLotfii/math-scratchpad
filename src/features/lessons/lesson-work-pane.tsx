import { useId, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import { Button } from '../../shared/ui/button';
import type { BankQuestion } from '../drive-bank/drive-bank';
import type { ScratchStore } from '../../store';
import { stepIsBlank, type Step } from '../../model';
import { LessonMathCheck } from './lesson-math-check';
import { MathDisplay } from '../../MathDisplay';
import { contentDirection, languageForText, LessonText, localizeLessonDigits, QuestionSource } from './lesson-content';
import type { LessonWorkItem, LessonWorkKind } from './lesson-work-items';

const KIND_LABEL: Record<LessonWorkKind, { fa: string; en: string }> = {
  example: { fa: 'مثال حل‌شده', en: 'Worked example' },
  guided: { fa: 'مثال هدایت‌شده', en: 'Guided example' },
  check: { fa: 'تمرین کوتاه', en: 'Quick check' },
  exercise: { fa: 'تمرین بخش', en: 'Section exercise' },
};

export function workItemLabel(item: LessonWorkItem, index: number, uiLang: 'fa' | 'en'): string {
  const kind = KIND_LABEL[item.kind][uiLang];
  const id = item.kind === 'check' || item.kind === 'exercise' ? ` · ${item.question.id}` : '';
  const short = item.title.replace(/\s+/g, ' ').replace(/\\\(|\\\)/g, '').slice(0, 60);
  return `${localizeLessonDigits(index + 1, uiLang)}. ${kind}${id} — ${short}`;
}

/**
 * The lesson "Your work" pane: a selector over the current section's work items and the app's
 * existing step editor + math toolbar (composed through LessonMathCheck, never modified).
 */
export function LessonWorkPane({ items, selected, onSelect, uiLang, getWorkStore, onWork, renderCheck, savedSteps, onFocusItem, onBlurItem, onRevealSolution }: {
  items: LessonWorkItem[];
  selected: LessonWorkItem | undefined;
  onSelect: (key: string) => void;
  uiLang: 'fa' | 'en';
  getWorkStore: (item: LessonWorkItem) => ScratchStore;
  onWork: (key: string, answer: { type: 'math'; steps: Step[] }) => void;
  renderCheck: (question: BankQuestion) => ReactNode;
  savedSteps: (key: string) => Step[] | undefined;
  onFocusItem?: (item: LessonWorkItem) => void;
  onBlurItem?: (item: LessonWorkItem) => void;
  onRevealSolution?: (item: LessonWorkItem) => void;
}) {
  const fa = uiLang === 'fa', selectId = useId();
  const [solutionShown, setSolutionShown] = useState<Record<string, boolean>>({});
  const focusedItem = useRef<string | null>(null);
  if (!items.length) return <aside className="lesson-work-pane" aria-label={fa ? 'کار من' : 'Your work'}>
    <h2 className="lesson-work-title">{fa ? 'کار من' : 'Your work'}</h2>
    <p className="lesson-work-empty">{fa ? 'برای این بخش مثال یا تمرینی برای حل ثبت نشده است.' : 'This section has nothing to work on yet.'}</p>
  </aside>;
  const item = selected ?? items[0];
  const steps = savedSteps(item.key);
  const block = item.kind === 'example' || item.kind === 'guided' ? item.block : undefined;
  const attempted = !!steps?.some(step => !stepIsBlank(step));
  function handleFocus() {
    if (item.kind === 'check' || focusedItem.current === item.key) return;
    focusedItem.current = item.key;
    onFocusItem?.(item);
  }
  function handleBlur(event: FocusEvent<HTMLElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    if (focusedItem.current === item.key) onBlurItem?.(item);
    focusedItem.current = null;
  }
  return <aside className="lesson-work-pane" aria-label={fa ? 'کار من' : 'Your work'} onFocusCapture={handleFocus} onBlurCapture={handleBlur}>
    <h2 className="lesson-work-title">{fa ? 'کار من' : 'Your work'}</h2>
    <label className="lesson-work-select-label" htmlFor={selectId}>{fa ? 'روی کدام مورد این بخش کار می‌کنی؟' : 'What are you working on?'}</label>
    <select id={selectId} className="lesson-work-select" dir={fa ? 'rtl' : 'ltr'} value={item.key} onChange={event => onSelect(event.currentTarget.value)}>
      {items.map((entry, index) => <option key={entry.key} value={entry.key}>{workItemLabel(entry, index, uiLang)}</option>)}
    </select>
    <div className="lesson-work-item" data-work-kind={item.kind} key={item.key}>
      <p className="lesson-work-kind">{KIND_LABEL[item.kind][uiLang]}</p>
      {item.kind === 'check' ? renderCheck(item.question) : <>
        {item.kind === 'exercise'
          ? <div className="lesson-work-question">
              {item.question.prompt && <p lang={languageForText(item.question.prompt)} dir={contentDirection(item.question.prompt)}><LessonText text={item.question.prompt} /></p>}
              <QuestionSource source={item.question.source} mode={item.question.mode} label={fa ? 'عبارت سؤال' : 'Question expression'} mathLabel={fa ? 'عبارت ریاضی سؤال' : 'Question math expression'} textClassName="lesson-check-source-text" mathClassName="lesson-check-source" />
            </div>
          : <div className="lesson-work-question">
              <p lang={languageForText(item.title)} dir={contentDirection(item.title)}><LessonText text={item.title} /></p>
              {block?.type === 'example' && block.text && block.text !== item.title && <p lang={languageForText(block.text)} dir={contentDirection(block.text)}><LessonText text={block.text} /></p>}
              {block?.type === 'example' && block.latex && <bdi dir="ltr" className="lesson-formula"><MathDisplay latex={block.latex} label={fa ? 'عبارت مثال' : 'Example expression'} display /></bdi>}
            </div>}
        <LessonMathCheck question={item.workQuestion} store={getWorkStore(item)} onAnswered={onWork} uiLang={uiLang} />
        {block?.type === 'example' && <div className="lesson-work-feedback">
          {!attempted
            ? <p className="lesson-work-hint">{fa ? 'اول خودت حداقل یک گام بنویس؛ بعد می‌توانی حلِ همین مثال در درس‌نامه را ببینی.' : 'Write at least one step first; then you can compare with the lesson’s solution.'}</p>
            : solutionShown[item.key]
              ? <ol className="lesson-work-solution" aria-label={fa ? 'حل مثال در درس‌نامه' : 'Lesson solution'}>{block.steps.map((text, index) => <li key={index} lang={languageForText(text)} dir={contentDirection(text)}><LessonText text={text} /></li>)}</ol>
              : <Button onClick={() => { onRevealSolution?.(item); setSolutionShown(value => ({ ...value, [item.key]: true })); }}>{fa ? 'مقایسه با حل درس‌نامه' : 'Compare with the lesson solution'}</Button>}
        </div>}
        {item.kind !== 'example' && <p className="lesson-work-hint">{fa ? 'جواب نهایی این مورد در بانک نیست؛ کارت فقط روی همین دستگاه ذخیره می‌شود و نمره داده نمی‌شود.' : 'This item has no stored answer; your work is saved on this device only and is not graded.'}</p>}
      </>}
    </div>
  </aside>;
}
