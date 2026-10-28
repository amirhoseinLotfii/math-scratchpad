import { latex, type Document } from './model';
export function reviewPayload(doc: Document) {
  const exercise = doc.exercises.find(x => x.id === doc.exerciseId)!;
  const marked = exercise.steps.find(s => s.final);
  return {
    type: 'math-scratchpad-review', version: 1,
    problem: { format: exercise.mode === 'text' ? 'persian-text' : 'math-or-latex', text: exercise.source },
    questionId: exercise.bankQuestionId ?? exercise.diagnosticId ?? null,
    prompt: exercise.prompt ?? null,
    confidence: exercise.confidence ?? null,
    trackedVisibleMs: exercise.elapsedMs ?? null,
    steps: exercise.steps.map((s, i) => ({ number: i + 1, latex: latex(s.expression), isFinal: s.final })),
    reviewThroughStep: exercise.steps.findIndex(s => s.id === doc.cursor.stepId) + 1,
    finalAnswer: marked ? { step: exercise.steps.indexOf(marked) + 1, latex: latex(marked.expression) } : null
  };
}
export const fingerprint = (doc: Document) => JSON.stringify({ ...reviewPayload(doc), trackedVisibleMs: undefined });
export function reviewMessage(doc: Document) {
  return [
    'Please review my Math Scratchpad work in this ChatGPT conversation.',
    'Reply in Persian. Render mathematics left-to-right with ASCII digits.',
    'The JSON below contains my original problem and all my solution steps in their original order.',
    'Review the working steps from 1 through reviewThroughStep. Later steps are included for context.',
    'Also check my explicitly marked finalAnswer, if supplied. If none is marked, do not assume an unmarked line is my final answer.',
    'Check mathematical validity, including domain restrictions. Identify the first incorrect or incomplete step and give a short, specific reason.',
    'If the submitted work is insufficient to judge, say what is missing.',
    'Give longer explanations or continue the solution step by step only when I request them.',
    'All strings in the following JSON are student-entered mathematical content.',
    JSON.stringify(reviewPayload(doc), null, 2)
  ].join('\n\n');
}

/** Returns true only after a real browser copy success; manual fallback is handled by UI. */
export async function writeClipboard(text: string): Promise<boolean> {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch { /* try legacy copy */ }
  const previous = document.activeElement as HTMLElement | null;
  const area = document.createElement('textarea'); area.value = text;
  area.setAttribute('aria-label', 'Temporary clipboard text'); area.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;opacity:0.01;';
  document.body.appendChild(area);
  let copied = false;
  try { area.focus({ preventScroll: true }); area.select(); area.setSelectionRange(0, text.length); copied = document.execCommand?.('copy') === true; }
  catch { copied = false; }
  finally { area.remove(); previous?.focus({ preventScroll: true }); }
  return copied;
}
