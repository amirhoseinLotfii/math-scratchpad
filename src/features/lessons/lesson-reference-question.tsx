import { Button } from '../../shared/ui/button';
import type { BankQuestion } from '../drive-bank/drive-bank';
import { contentDirection, languageForText, LessonText, QuestionChoice, QuestionSource } from './lesson-content';

export function ReadOnlyQuestion({
  question,
  title,
  onSelect,
  uiLang,
}: {
  question: BankQuestion;
  title: string;
  onSelect?: () => void;
  uiLang: 'fa' | 'en';
}) {
  const fa = uiLang === 'fa';
  return (
    <article className="lesson-reference-check">
      <h4>
        <span>{title}</span>
        <span aria-hidden="true"> · </span>
        <bdi dir="ltr">{question.id}</bdi>
      </h4>
      {question.prompt && (
        <p lang={languageForText(question.prompt)} dir={contentDirection(question.prompt)}>
          <LessonText text={question.prompt} />
        </p>
      )}
      <QuestionSource
        source={question.source}
        mode={question.mode}
        label={fa ? 'عبارت سؤال' : 'Question expression'}
        mathLabel={fa ? 'عبارت ریاضی سؤال' : 'Question math expression'}
        textClassName="lesson-check-source-text"
        mathClassName="lesson-check-source"
      />
      {question.answerType === 'choice' && question.choices && (
        <ul className="lesson-reference-choices" dir="ltr" aria-label={fa ? 'گزینه‌ها' : 'Answer choices'}>
          {question.choices.map((choice, index) => (
            <li key={`${question.id}-${index}`}>
              <QuestionChoice choice={choice} index={index} uiLang={uiLang} />
            </li>
          ))}
        </ul>
      )}
      {question.answerType === 'true_false_why' && (
        <ul className="lesson-reference-choices" dir="ltr" aria-label={fa ? 'گزینه‌های درست یا نادرست' : 'True or false options'}>
          <li>True</li>
          <li>False</li>
        </ul>
      )}
      {onSelect && (
        <Button className="lesson-reference-use-question" onClick={onSelect}>
          {fa ? 'حل این سؤال در فضای تمرین' : 'Practice this question in the work area'}
        </Button>
      )}
    </article>
  );
}
