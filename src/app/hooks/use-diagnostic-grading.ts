import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { gradeDiagnostic } from '../../assessment';
import { diagnosticQuestions } from '../../diagnostic';
import { fractionRoundOne } from '../../fractionRoundOne';
import { stepLatex, type Exercise } from '../../model';
import { writeClipboard } from '../../review';
import { actions, type ScratchState, type ScratchStore } from '../../store';
import { emitLearnEvent, type LearnEventContext, type LearnEventDraft } from '../../sync/events';

export function useDiagnosticGrading({
  state,
  store,
  ex,
  sessionId,
  showResults,
  practiceAttemptCounts,
  setManual,
}: {
  state: ScratchState;
  store: ScratchStore;
  ex: Exercise;
  sessionId: string;
  showResults: boolean;
  practiceAttemptCounts: MutableRefObject<Map<string, number>>;
  setManual: (text: string) => void;
}) {
  const reportedDiagnosticAttempts = useRef(new Set<string>());
  const fractions = ex.assessment === 'fractions-round-1';
  const questionBank = fractions ? fractionRoundOne : diagnosticQuestions;
  const exam =
    !!ex.diagnosticId && state.doc.exercises.some(x => x.diagnosticId === questionBank.length);

  const examGrades = useMemo(
    () =>
      !showResults || !exam
        ? []
        : questionBank.map(question => {
            const entry = state.doc.exercises.find(x => x.diagnosticId === question.id);
            return {
              question,
              result: !entry || entry.skipped ? null : gradeDiagnostic(entry, question),
            };
          }),
    [showResults, exam, questionBank, state.doc]
  );

  useEffect(() => {
    if (!showResults || !exam || !examGrades.length) return;
    const snapshot = examGrades.map(({ question, result }) => {
      const entry = state.doc.exercises.find(item => item.diagnosticId === question.id);
      return [
        question.id,
        result?.numeric ?? 'skipped',
        entry?.answerText ?? '',
        entry?.steps.map(step => stepLatex(step)) ?? [],
      ];
    });
    const signature = `${sessionId}:${JSON.stringify(snapshot)}`;
    if (reportedDiagnosticAttempts.current.has(signature)) return;
    reportedDiagnosticAttempts.current.add(signature);
    const eventContext: LearnEventContext = {
      bankVersion: 'diagnostic',
      session: sessionId || 'unknown',
      chapter: 0,
      lesson: 'diagnostic',
      section: 'diagnostic',
      concept: 'arithmetic',
    };
    for (const { question, result } of examGrades) {
      const entry = state.doc.exercises.find(item => item.diagnosticId === question.id);
      if (!entry || entry.skipped || !result) continue;
      const itemId = String(question.id);
      const attemptNo = (practiceAttemptCounts.current.get(itemId) ?? 0) + 1;
      practiceAttemptCounts.current.set(itemId, attemptNo);
      const steps = entry.steps.map(step => stepLatex(step).slice(0, 4_000)).slice(0, 40);
      const verdict: LearnEventDraft['verdict'] =
        result.numeric === 'correct' || result.numeric === 'incorrect'
          ? result.numeric
          : 'submitted';
      const verdictSource: LearnEventDraft['verdictSource'] =
        verdict === 'submitted' ? 'none' : 'checker';
      const event = {
        itemId,
        itemType: 'step_by_step' as const,
        questionText: question.stem.slice(0, 8_000),
        userAnswer: (entry.answerText || steps.join('\n')).slice(0, 8_000),
        steps,
        verdict,
        verdictSource,
        attemptNo,
      };
      emitLearnEvent(eventContext, { ...event, type: 'exercise_attempt' });
      if (verdict === 'incorrect') {
        emitLearnEvent(eventContext, {
          ...event,
          type: 'mistake_logged',
          verdict: 'incorrect',
          verdictSource: 'checker',
        });
      }
    }
  }, [exam, examGrades, practiceAttemptCounts, sessionId, showResults, state.doc.exercises]);

  async function copyReport() {
    const text = examGrades
      .map(
        ({ question, result }) =>
          `Q${question.id} | ${question.stem}\nExpected: ${question.expected}\n${result?.numeric ?? 'skipped'}`
      )
      .join('\n\n');
    if (await writeClipboard(text)) store.dispatch(actions.notice('Diagnostic report copied.'));
    else setManual(text);
  }

  return { fractions, questionBank, exam, examGrades, copyReport };
}
