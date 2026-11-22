import type { BankQuestion } from '../../domain/entities/drive-bank.types';
import type { LessonWorkAnswers } from '../../domain/entities/lesson-progress.types';
import {
  allowedWorkKeys,
  exampleWorkKey,
  normalizeWorkAnswers,
  questionWorkKey,
  workAnswerHasContent,
  workAnswerHasCurrentContent,
} from '../../domain/validation/lesson-work-answers';
import { BREAKPOINT_MEDIA } from '../../shared/lib/breakpoints';
import type { LessonSection } from './lesson-sections';
import type { LessonBlock } from './types';

export {
  allowedWorkKeys,
  exampleWorkKey,
  normalizeWorkAnswers,
  questionWorkKey,
  workAnswerHasContent,
  workAnswerHasCurrentContent,
  type LessonWorkAnswers,
};

/** One thing in the current lesson section the learner can work on beside the lesson text. */
export type LessonWorkItem = (
  | { key: string; kind: 'example' | 'guided'; conceptId: string; blockIndex: number; block: LessonBlock; title: string }
  | { key: string; kind: 'check' | 'exercise'; question: BankQuestion; title: string }
) & {
  /** Stable stand-in question for the composed step editor; carries no answer data. */
  workQuestion: BankQuestion;
};

export type LessonWorkKind = LessonWorkItem['kind'];
export type LessonPaneMode = 'split' | 'tabs';

export const SPLIT_MIN = 30;
export const SPLIT_MAX = 70;
export const SPLIT_DEFAULT = 50;
export const SPLIT_MEDIA_QUERY = BREAKPOINT_MEDIA.split;
export const SPLIT_RATIO_STORAGE_KEY = 'math-scratchpad:lesson-split-ratio';

const GUIDED = /^\s*مثال\s+هدایت|^\s*guided\s+example/i;
const HOW_TO_OR_METHOD = /How\s*To|^\s*روش\s|کادر\s*«?چگونه/i;

/** Wide screens get a docked lesson + work split; narrower screens switch with tabs. */
export function lessonPaneMode(splitMatches: boolean): LessonPaneMode { return splitMatches ? 'split' : 'tabs'; }

export function clampSplitRatio(value: unknown): number {
  const number = typeof value === 'string' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) return SPLIT_DEFAULT;
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(number)));
}

/** Lesson-pane width (percent) for a pointer x inside the split container; the lesson sits on the inline-start side. */
export function ratioFromPointer(clientX: number, rect: { left: number; width: number }, rtl: boolean): number {
  if (!rect.width) return SPLIT_DEFAULT;
  const fromLeft = ((clientX - rect.left) / rect.width) * 100;
  return clampSplitRatio(rtl ? 100 - fromLeft : fromLeft);
}

function blockText(block: LessonBlock): string {
  if (block.type === 'example') return block.title || block.text || '';
  if (block.type === 'unsupported' || block.type === 'image') return '';
  return block.text ?? '';
}

/**
 * Work items for one section, in reading order: worked examples and guided examples from the
 * lesson text, then the section's quick checks (L), then its exercises (book first, as selected).
 */
export function buildSectionWorkItems(section: LessonSection | undefined, checks: BankQuestion[], exercises: BankQuestion[]): LessonWorkItem[] {
  if (!section) return [];
  const items: LessonWorkItem[] = [];
  for (const { concept, blocks } of section.concepts) {
    for (const block of blocks) {
      const blockIndex = concept.blocks.indexOf(block);
      if (blockIndex < 0) continue;
      const text = blockText(block);
      if (block.type === 'example' && block.steps.length && !HOW_TO_OR_METHOD.test(text)) {
        items.push({ key: exampleWorkKey(concept.id, blockIndex), kind: 'example', conceptId: concept.id, blockIndex, block, title: text, workQuestion: { id: exampleWorkKey(concept.id, blockIndex), mode: 'math', source: '' } });
      } else if (block.type === 'note' && GUIDED.test(text)) {
        items.push({ key: exampleWorkKey(concept.id, blockIndex), kind: 'guided', conceptId: concept.id, blockIndex, block, title: text, workQuestion: { id: exampleWorkKey(concept.id, blockIndex), mode: 'math', source: '' } });
      }
    }
  }
  for (const question of checks) items.push({ key: questionWorkKey(question.id), kind: 'check', question, title: question.prompt || question.source, workQuestion: question });
  for (const question of exercises) items.push({ key: questionWorkKey(question.id), kind: 'exercise', question, title: question.prompt || question.source, workQuestion: { ...question, id: questionWorkKey(question.id) } });
  return items;
}

/** Keeps the selection when it still exists in this section, otherwise picks the first item. */
export function resolveSelectedWorkItem(items: LessonWorkItem[], selectedKey: string | undefined): LessonWorkItem | undefined {
  return items.find(item => item.key === selectedKey) ?? items[0];
}
