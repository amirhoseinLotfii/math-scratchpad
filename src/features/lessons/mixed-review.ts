import type { BankQuestion, DriveBank } from '../drive-bank/drive-bank';
import type { LessonPracticeResult, LessonProgress, MixedReviewRun } from './types';

export type MixedReviewMode = 'lesson' | 'chapter';
export type MixedReviewHistory = Record<string, Pick<LessonPracticeResult, 'correctness' | 'updatedAt' | 'submittedAt' | 'status'> | undefined>;

export const MAX_MIXED_REVIEW_QUESTIONS = 60;
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** Hide chapter/lesson/concept citations embedded in question text during an unanswered mixed item. */
export function redactMixedReviewAttribution(text: string): string {
  return text
    .replace(/(?:پیش‌حسابان|Precalculus)\s+[\p{N}.٫]+\s*·\s*[^:：]+[:：]\s*/giu, '')
    .replace(/\s*\(پیوند با کتاب:[\s\S]*\)\s*$/u, '')
    .replace(/تمرین کتاب\s*·\s*(?:بخش|section)\s+[\p{N}.٫-]+(?:\s*·\s*(?:شماره(?:ٔ)?|number|no\.?)\s*[\p{N}.٫-]+)?/giu, 'تمرین کتاب')
    .replace(/با الگوبرداری از تمرین کتاب\s+[\w.-]+/giu, '')
    .replace(/\bPC-\d+\.\d+-[\w.-]+\b/gu, 'تمرین کتاب')
    .replace(/[ \t]{2,}/gu, ' ')
    .trim();
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const value = random();
    const bounded = Number.isFinite(value) ? Math.min(0.999999, Math.max(0, value)) : 0;
    const swap = Math.floor(bounded * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function priority(history: MixedReviewHistory[string], now: number): number {
  if (history?.correctness === 'incorrect') return 0;
  if (!history || history.status === 'not_started') return 1;
  const lastSeen = Date.parse(history.updatedAt ?? history.submittedAt ?? '');
  if (!Number.isFinite(lastSeen)) return 1;
  if (now - lastSeen >= STALE_AFTER_MS) return 2;
  return 3;
}

/** Build a tag-driven cumulative set; tags stay on bank objects and are not rendered before response. */
export function buildMixedReviewSet(bank: DriveBank, options: {
  lessonId: string;
  mode: MixedReviewMode;
  history?: MixedReviewHistory;
  now?: number;
  random?: () => number;
  limit?: number;
}): BankQuestion[] {
  const lessonIndex = bank.lessons?.findIndex(lesson => lesson.id === options.lessonId) ?? -1;
  if (lessonIndex < 0) return [];
  const chapter = bank.chapters?.find(item => item.lessonIds.includes(options.lessonId))
    ?? (bank.chapter?.lessonIds.includes(options.lessonId) ? bank.chapter : undefined);
  const taggedChapterIds = new Set(bank.questions.filter(question => question.tags?.lesson === options.lessonId).map(question => question.tags?.chapter).filter((id): id is string => !!id));
  const chapterId = chapter?.id ?? (taggedChapterIds.size === 1 ? [...taggedChapterIds][0] : undefined);
  const chapterLessonIds = chapter?.lessonIds ?? (chapterId ? bank.lessons!.filter(lesson => bank.questions.some(question => question.tags?.chapter === chapterId && question.tags?.lesson === lesson.id)).map(lesson => lesson.id) : []);
  const lastTaggedChapterLesson = bank.lessons!.filter(lesson => chapterLessonIds.includes(lesson.id)
    && bank.questions.some(question => question.tags?.chapter === chapterId && question.tags?.lesson === lesson.id && question.stage !== 'learn')).at(-1)?.id;
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now();
  const limit = Math.max(1, Math.min(MAX_MIXED_REVIEW_QUESTIONS, Math.floor(options.limit ?? (options.mode === 'chapter' ? 60 : 30))));
  const eligible = bank.questions.filter(question => {
    const tags = question.tags;
    if (!tags?.lesson || !tags.concept || !tags.skill || question.stage === 'learn') return false;
    const taggedLessonIndex = bank.lessons!.findIndex(lesson => lesson.id === tags.lesson);
    if (taggedLessonIndex < 0 || taggedLessonIndex > lessonIndex) return false;
    if (options.mode === 'chapter') return !!chapterId && tags.chapter === chapterId && lastTaggedChapterLesson === options.lessonId;
    return true;
  });

  const byPriority = new Map<number, Map<string, BankQuestion[]>>();
  for (const question of eligible) {
    const rank = priority(options.history?.[question.id], now);
    const groups = byPriority.get(rank) ?? new Map<string, BankQuestion[]>();
    const key = `${question.tags!.lesson}:${question.tags!.concept}:${question.tags!.skill}`;
    groups.set(key, [...(groups.get(key) ?? []), question]);
    byPriority.set(rank, groups);
  }

  const ordered: BankQuestion[] = [];
  for (const rank of [0, 1, 2, 3]) {
    const groups = [...(byPriority.get(rank)?.values() ?? [])].map(group => shuffle(group, random));
    const shuffledGroups = shuffle(groups, random);
    let depth = 0;
    while (shuffledGroups.some(group => group[depth])) {
      for (const group of shuffledGroups) if (group[depth]) ordered.push(group[depth]!);
      depth++;
    }
  }
  return shuffle(ordered.slice(0, limit), random);
}

export function createMixedReviewRun(questionIds: string[], mode: MixedReviewMode, now = new Date().toISOString(), random = Math.random): MixedReviewRun {
  const suffix = Math.floor(Math.max(0, Math.min(0.999999, random())) * 0x1000000).toString(36).padStart(5, '0');
  const id = `mixed-${Date.parse(now).toString(36)}-${suffix}`;
  return { id, mode, questionIds: [...new Set(questionIds)], startedAt: now, updatedAt: now, results: {} };
}

export function mixedReviewHistory(progressByLesson: Record<string, LessonProgress>): MixedReviewHistory {
  const history: MixedReviewHistory = {};
  for (const progress of Object.values(progressByLesson)) {
    for (const [questionId, result] of Object.entries(progress.practiceResults ?? {})) history[questionId] = result;
    for (const run of progress.mixedReviewRuns ?? []) for (const [questionId, result] of Object.entries(run.results)) history[questionId] = result;
  }
  return history;
}
