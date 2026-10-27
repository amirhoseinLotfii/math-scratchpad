import { latex, type Exercise } from '../../../model';
export type WorkspaceLayout = 'phone' | 'laptop' | 'desktop';
export function layoutAtWidth(width: number): WorkspaceLayout { return width >= 1600 ? 'desktop' : width >= 900 ? 'laptop' : 'phone'; }
export function questionStatus(exercise: Exercise): 'Skipped' | 'Answered' | 'Draft' | 'Not started' {
 if (exercise.skipped) return 'Skipped';
 const hasWork = exercise.steps.some(step => latex(step.expression) !== '\\square');
 return hasWork ? exercise.confidence ? 'Answered' : 'Draft' : 'Not started';
}
export const keyboardHelp = [
 ['/', 'Insert symbols'], ['Ctrl / Cmd + Z', 'Undo'], ['Ctrl / Cmd + Shift + Z', 'Redo'],
 ['Tab', 'Move focus'], ['← →', 'Move through digits'], ['Esc', 'Close dialog'],
] as const;
