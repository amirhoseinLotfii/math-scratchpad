import { stepIsBlank, type Exercise } from '../../../model';
import { BREAKPOINTS, type WorkspaceLayout } from '../../../shared/lib/breakpoints';
export type { WorkspaceLayout };
export function layoutAtWidth(width: number): WorkspaceLayout { return width >= BREAKPOINTS.wide ? 'desktop' : width >= BREAKPOINTS.workspace ? 'laptop' : 'phone'; }
export function questionStatus(exercise: Exercise): 'Skipped' | 'Answered' | 'Draft' | 'Not started' {
 if (exercise.skipped) return 'Skipped';
 const trueFalseWhy = exercise.answerType === 'true_false_why';
 const hasWork = trueFalseWhy
  ? !!exercise.answerChoice || !!exercise.answerReason?.trim()
  : exercise.answerType === 'text' || exercise.answerType === 'choice' || exercise.answerType === 'find_mistake'
   ? !!exercise.answerText?.trim()
   : exercise.steps.some(step => !stepIsBlank(step));
 if (!hasWork) return 'Not started';
 const complete = !trueFalseWhy || (!!exercise.answerChoice && !!exercise.answerReason?.trim());
 return exercise.confidence && complete ? 'Answered' : 'Draft';
}
export const keyboardHelp = [
 ['/', 'Open Insert Math Element; choose Fraction to insert a fraction'], ['Ctrl / Cmd + Z', 'Undo'], ['Ctrl / Cmd + Shift + Z', 'Redo'],
 ['Alt + Enter', 'Mark step as final answer'], ['Tab', 'Move focus'], ['← →', 'Move through digits'], ['Esc', 'Close dialog'],
] as const;
