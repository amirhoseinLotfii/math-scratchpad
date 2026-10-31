import type { Concept, Difficulty, Lesson, LessonBlock, Lang } from './types';

export type LessonParseResult = { lessons: Lesson[]; warnings: string[] };
const safeId = /^[\w.-]{1,80}$/;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const boundedText = (value: unknown, max = 20000): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const warning = (warnings: string[], path: string, reason: string) => warnings.push(`${path}: ${reason}`);

function parseBlock(value: unknown, path: string, warnings: string[]): LessonBlock {
  const block = isRecord(value) ? value : {};
  const rawType = typeof block.type === 'string' ? block.type : 'unknown';
  const unsupported = (reason: string): LessonBlock => {
    warning(warnings, path, reason);
    let source: string | undefined;
    try { source = JSON.stringify(value, null, 2); } catch { source = String(value); }
    return { type: 'unsupported', originalType: rawType, ...(source ? { source } : {}) };
  };
  if (!isRecord(value)) return unsupported('block must be a JSON object');
  const lang = block.lang === 'fa' || block.lang === 'en' ? block.lang as Lang : undefined;
  if (block.lang !== undefined && lang === undefined) warning(warnings, `${path}.lang`, 'unsupported language was ignored');
  const withLang = <T extends object>(result: T): T & { lang?: Lang } => lang ? { ...result, lang } : result;

  if (rawType === 'heading' || rawType === 'paragraph' || rawType === 'note') {
    if (!boundedText(block.text)) return unsupported(`${rawType} block requires non-empty text (maximum 20000 characters)`);
    return withLang({ type: rawType as 'heading' | 'paragraph' | 'note', text: block.text });
  }
  if (rawType === 'definition') {
    if (!boundedText(block.text)) return unsupported('definition block requires non-empty text (maximum 20000 characters)');
    if (block.latex !== undefined && (typeof block.latex !== 'string' || block.latex.length > 20000)) return unsupported('definition latex must be text of at most 20000 characters');
    return withLang({ type: 'definition', text: block.text, ...(typeof block.latex === 'string' ? { latex: block.latex } : {}) });
  }
  if (rawType === 'example') {
    const optionalTextValid = (key: 'title' | 'text' | 'latex', max: number) => block[key] === undefined || (typeof block[key] === 'string' && block[key].length <= max);
    if ((block.steps !== undefined && (!Array.isArray(block.steps) || block.steps.length > 100 || !block.steps.every(step => typeof step === 'string' && step.length <= 20000)))
      || !optionalTextValid('title', 500) || !optionalTextValid('text', 20000) || !optionalTextValid('latex', 20000)) return unsupported('example fields are invalid; steps must be an array of at most 100 text items and optional title/text/latex fields must fit their limits');
    if (block.steps === undefined && ![block.title, block.text, block.latex].some(item => boundedText(item))) return unsupported('example block requires steps or non-empty title, text, or latex');
    return withLang({
      type: 'example',
      ...(typeof block.title === 'string' ? { title: block.title } : {}),
      ...(typeof block.text === 'string' ? { text: block.text } : {}),
      ...(typeof block.latex === 'string' ? { latex: block.latex } : {}),
      steps: (block.steps ?? []) as string[],
    });
  }
  if (rawType === 'math') {
    if (!boundedText(block.latex)) return unsupported('math block requires non-empty latex (maximum 20000 characters)');
    if (block.text !== undefined && (typeof block.text !== 'string' || block.text.length > 20000)) warning(warnings, `${path}.text`, 'invalid caption was ignored');
    return withLang({ type: 'math', latex: block.latex, ...(boundedText(block.text) ? { text: block.text } : {}) });
  }
  if (rawType === 'image') {
    if ((block.src === undefined || block.src === '') && boundedText(block.text)) {
      warning(warnings, path, 'image source is missing; description retained');
      return withLang({ type: 'image-description', text: block.text });
    }
    if (!boundedText(block.src, 2000)) return unsupported('image block requires a source URL or a text description');
    if (!boundedText(block.alt, 500)) return unsupported('image block requires non-empty alt text (maximum 500 characters)');
    if (block.caption !== undefined && !boundedText(block.caption, 2000)) return unsupported('image caption must be non-empty text of at most 2000 characters');
    return withLang({ type: 'image', src: block.src, alt: block.alt, ...(typeof block.caption === 'string' ? { caption: block.caption } : {}) });
  }
  return unsupported(`unsupported block type: ${rawType}`);
}

function parseBlocks(value: unknown, path: string, warnings: string[]): LessonBlock[] {
  if (!Array.isArray(value)) {
    warning(warnings, path, 'blocks must be an array');
    return [];
  }
  if (value.length > 100) warning(warnings, path, 'blocks after the first 100 were ignored');
  return value.slice(0, 100).map((block, index) => parseBlock(block, `${path}[${index}]`, warnings));
}

function parseConcepts(value: unknown, lessonId: string, knownQuestions: Set<string>, usedIds: Set<string>, warnings: string[]): Concept[] {
  if (!Array.isArray(value)) {
    warning(warnings, `lessons.${lessonId}.concepts`, 'concepts must be an array');
    return [];
  }
  const concepts: Concept[] = [];
  for (const [index, raw] of value.entries()) {
    const path = `lessons.${lessonId}.concepts[${index}]`;
    if (!isRecord(raw) || typeof raw.id !== 'string' || !safeId.test(raw.id) || !boundedText(raw.title, 500)) {
      warning(warnings, path, 'invalid concept was ignored');
      continue;
    }
    if (usedIds.has(raw.id)) {
      warning(warnings, path, `duplicate concept id ${raw.id} was ignored`);
      continue;
    }
    usedIds.add(raw.id);
    const concept: Concept = {
      id: raw.id,
      title: raw.title,
      blocks: parseBlocks(raw.blocks, `${path}.blocks`, warnings),
      checkQuestionIds: [],
    };
    if (typeof raw.pages === 'string' && raw.pages.length <= 100) concept.pages = raw.pages;
    else if (raw.pages !== undefined) warning(warnings, `${path}.pages`, 'invalid page reference was ignored');
    if (!Array.isArray(raw.checkQuestionIds)) {
      warning(warnings, `${path}.checkQuestionIds`, 'checkQuestionIds must be an array');
    } else {
      const seenChecks = new Set<string>();
      for (const questionId of raw.checkQuestionIds) {
        if (typeof questionId !== 'string' || !knownQuestions.has(questionId)) {
          warning(warnings, `${path}.checkQuestionIds`, `missing or invalid question reference ${String(questionId)} was dropped`);
          continue;
        }
        if (seenChecks.has(questionId)) {
          warning(warnings, `${path}.checkQuestionIds`, `duplicate question reference ${questionId} was dropped`);
          continue;
        }
        seenChecks.add(questionId);
        concept.checkQuestionIds.push(questionId);
      }
    }
    concepts.push(concept);
  }
  return concepts;
}

export function parseLessons(value: unknown, questionIds: Iterable<string>): LessonParseResult {
  const warnings: string[] = [];
  if (value === undefined) return { lessons: [], warnings };
  if (!Array.isArray(value)) {
    warning(warnings, 'lessons', 'lessons must be an array');
    return { lessons: [], warnings };
  }
  const knownQuestions = new Set(questionIds), usedLessonIds = new Set<string>(), usedConceptIds = new Set<string>(), lessons: Lesson[] = [];
  for (const [index, raw] of value.entries()) {
    const path = `lessons[${index}]`;
    if (!isRecord(raw) || typeof raw.id !== 'string' || !safeId.test(raw.id)
      || !boundedText(raw.book, 500) || !boundedText(raw.section, 100) || !boundedText(raw.title, 1000)) {
      warning(warnings, path, 'invalid lesson was ignored');
      continue;
    }
    if (usedLessonIds.has(raw.id)) {
      warning(warnings, path, `duplicate lesson id ${raw.id} was ignored`);
      continue;
    }
    usedLessonIds.add(raw.id);
    const lesson: Lesson = {
      id: raw.id,
      book: raw.book,
      section: raw.section,
      title: raw.title,
      concepts: parseConcepts(raw.concepts, raw.id, knownQuestions, usedConceptIds, warnings),
    };
    if (typeof raw.pages === 'string' && raw.pages.length <= 100) lesson.pages = raw.pages;
    else if (raw.pages !== undefined) warning(warnings, `${path}.pages`, 'invalid page reference was ignored');
    lessons.push(lesson);
  }
  return { lessons, warnings };
}

export function parseDifficulty(value: unknown): Difficulty | undefined {
  return value === 1 || value === 2 || value === 3 ? value : undefined;
}
