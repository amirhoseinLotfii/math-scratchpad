import { stepIsBlank, type Exercise } from '../../../model';
export type WorkspaceLayout = 'phone' | 'laptop' | 'desktop';
export function layoutAtWidth(width: number): WorkspaceLayout { return width >= 1600 ? 'desktop' : width >= 900 ? 'laptop' : 'phone'; }
export function questionStatus(exercise: Exercise): 'Skipped' | 'Answered' | 'Draft' | 'Not started' {
 if (exercise.skipped) return 'Skipped';
 const hasWork = exercise.steps.some(step => !stepIsBlank(step));
 return hasWork ? exercise.confidence ? 'Answered' : 'Draft' : 'Not started';
}
export const keyboardHelp = [
 ['/', 'Open Insert Math Element; choose Fraction to insert a fraction'], ['Ctrl / Cmd + Z', 'Undo'], ['Ctrl / Cmd + Shift + Z', 'Redo'],
 ['Alt + Enter', 'Mark step as final answer'], ['Tab', 'Move focus'], ['← →', 'Move through digits'], ['Esc', 'Close dialog'],
] as const;
