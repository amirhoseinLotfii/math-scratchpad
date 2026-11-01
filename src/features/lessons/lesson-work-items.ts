import type { BankQuestion } from '../drive-bank/drive-bank';
import type { Step } from '../../model';
import type { LessonSection } from './lesson-sections';
import type { Lesson, LessonBlock } from './types';

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

/** Learn-only scratch work keyed by work item; never part of practice sessions or exports. */
export type LessonWorkAnswers = Record<string, { type: 'math'; steps: Step[] }>;

export const SPLIT_MIN = 30;
export const SPLIT_MAX = 70;
export const SPLIT_DEFAULT = 50;
export const SPLIT_MEDIA_QUERY = '(min-width: 1100px)';
export const SPLIT_RATIO_STORAGE_KEY = 'math-scratchpad:lesson-split-ratio';

const GUIDED = /^\s*مثال\s+هدایت|^\s*guided\s+example/i;
const HOW_TO_OR_METHOD = /How\s*To|^\s*روش\s|کادر\s*«?چگونه/i;

export function exampleWorkKey(conceptId: string, blockIndex: number) { return `ex:${conceptId}:${blockIndex}`; }
export function questionWorkKey(questionId: string) { return `q:${questionId}`; }

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
  for (const question of exercises) items.push({ key: questionWorkKey(question.id), kind: 'exercise', question, title: question.prompt || question.source, workQuestion: { id: questionWorkKey(question.id), mode: 'math', source: question.source } });
  return items;
}

/** All example and guided-example scratch work for one active v22 concept. */
export function buildConceptWorkItems(concept: LessonSection['concepts'][number]['concept'], conceptIndex: number): LessonWorkItem[] {
  const section: LessonSection = { id: concept.id, concepts: [{ concept, conceptIndex, blocks: concept.blocks }] };
  return buildSectionWorkItems(section, [], []);
}

/** Keeps the selection when it still exists in this section, otherwise picks the first item. */
export function resolveSelectedWorkItem(items: LessonWorkItem[], selectedKey: string | undefined): LessonWorkItem | undefined {
  return items.find(item => item.key === selectedKey) ?? items[0];
}

/** Valid storage keys for work in one lesson: example/guided blocks of its concepts and its practice questions. */
export function allowedWorkKeys(lesson: Lesson, questions: BankQuestion[]): Set<string> {
  const keys = new Set<string>();
  lesson.concepts.forEach(concept => concept.blocks.forEach((block, index) => {
    if (block.type === 'example' || block.type === 'note') keys.add(exampleWorkKey(concept.id, index));
  }));
  for (const question of questions) if (question.lessonId === lesson.id && question.stage !== 'learn') keys.add(questionWorkKey(question.id));
  return keys;
}

/**
 * Restores saved work tolerantly: unknown or invalid entries are dropped one by one so older or
 * damaged work can never invalidate the rest of the lesson progress.
 */
export function normalizeWorkAnswers(value: unknown, allowed: Set<string>, validSteps: (key: string, steps: unknown) => Step[] | undefined): LessonWorkAnswers | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result: LessonWorkAnswers = {};
  for (const [key, response] of Object.entries(value as Record<string, unknown>)) {
    if (!allowed.has(key) || !response || typeof response !== 'object' || (response as { type?: unknown }).type !== 'math') continue;
    const steps = validSteps(key, response);
    if (steps) result[key] = { type: 'math', steps };
  }
  return Object.keys(result).length ? result : undefined;
}
