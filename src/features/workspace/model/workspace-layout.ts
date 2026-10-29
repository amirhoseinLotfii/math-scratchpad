import { answerTypeOf, legacyMathWork, latex, type Exercise } from '../../../model';
export type WorkspaceLayout = 'phone' | 'laptop' | 'desktop';
export function layoutAtWidth(width: number): WorkspaceLayout { return width >= 1200 ? 'desktop' : width >= 900 ? 'laptop' : 'phone'; }
export function questionStatus(exercise: Exercise): 'Skipped' | 'Answered' | 'Draft' | 'Not started' {
 if (exercise.skipped) return 'Skipped';
 const hasWork = answerTypeOf(exercise) !== 'math' ? !!exercise.answerText?.trim() || legacyMathWork(exercise) : exercise.steps.some(step => latex(step.expression) !== '\\square');
 return hasWork ? exercise.confidence ? 'Answered' : 'Draft' : 'Not started';
}
export const keyboardHelp = [
 ['/', 'Insert fraction (math editor)'], ['^', 'Insert power (math editor)'], ['Alt + R', 'Insert root (math editor)'],
 ['Ctrl / Cmd + Z', 'Undo (math editor)'], ['Ctrl / Cmd + Shift + Z', 'Redo (math editor)'], ['Ctrl + Y', 'Redo (math editor)'],
 ['Enter', 'Add a step (math editor); activate a focused control'], ['Alt + Enter', 'Mark step as final answer'],
 ['← →', 'Move through digits and expression slots'], ['↑ ↓', 'Move between fraction fields or steps'],
 ['Home / End', 'Start / end of a number; first / last item in menus and toolbars'],
 ['Backspace / Delete', 'Delete backward / forward (math editor)'],
 ['Tab / Shift + Tab', 'Move between controls; enter / leave the toolbar'],
 ['Arrows', 'Move within a toolbar, menu, radio group or question list'],
 ['Space', 'Activate a focused button or radio'], ['Esc', 'Close dialog / menu; return to menu button when dismissed'],
 ['Ctrl + Alt + ← / →', 'Previous / next question (Windows / Linux)'],
 ['Cmd + Option + ← / →', 'Previous / next question (Mac)'],
] as const;
