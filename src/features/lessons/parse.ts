import type { Concept, Difficulty, Lesson, LessonBlock, LessonSectionDefinition, LearningChunk, Lang } from './types';

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
  const page = typeof block.page === 'number' && Number.isInteger(block.page) && block.page >= 1 && block.page <= 10000 ? block.page : undefined;
  if (block.page !== undefined && page === undefined) warning(warnings, `${path}.page`, 'invalid source page was ignored');
  const withMetadata = <T extends object>(result: T): T & { lang?: Lang; page?: number } => ({
    ...result,
    ...(lang ? { lang } : {}),
    ...(page !== undefined ? { page } : {}),
  });

  if (rawType === 'heading' || rawType === 'paragraph' || rawType === 'note') {
    if (!boundedText(block.text)) return unsupported(`${rawType} block requires non-empty text (maximum 20000 characters)`);
    if (block.latex !== undefined && (typeof block.latex !== 'string' || block.latex.length > 20000)) {
      warning(warnings, `${path}.latex`, 'invalid text-block formula was ignored');
    }
    return withMetadata({
      type: rawType as 'heading' | 'paragraph' | 'note',
      text: block.text,
      ...(typeof block.latex === 'string' && block.latex.trim() ? { latex: block.latex } : {}),
    });
  }
  if (rawType === 'definition') {
    if (!boundedText(block.text)) return unsupported('definition block requires non-empty text (maximum 20000 characters)');
    if (block.latex !== undefined && (typeof block.latex !== 'string' || block.latex.length > 20000)) return unsupported('definition latex must be text of at most 20000 characters');
    return withMetadata({ type: 'definition', text: block.text, ...(typeof block.latex === 'string' ? { latex: block.latex } : {}) });
  }
  if (rawType === 'example') {
    const optionalTextValid = (key: 'title' | 'text' | 'latex', max: number) => block[key] === undefined || (typeof block[key] === 'string' && block[key].length <= max);
    if ((block.steps !== undefined && (!Array.isArray(block.steps) || block.steps.length > 100 || !block.steps.every(step => typeof step === 'string' && step.length <= 20000)))
      || !optionalTextValid('title', 500) || !optionalTextValid('text', 20000) || !optionalTextValid('latex', 20000)) return unsupported('example fields are invalid; steps must be an array of at most 100 text items and optional title/text/latex fields must fit their limits');
    if (block.steps === undefined && ![block.title, block.text, block.latex].some(item => boundedText(item))) return unsupported('example block requires steps or non-empty title, text, or latex');
    return withMetadata({
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
    return withMetadata({ type: 'math', latex: block.latex, ...(boundedText(block.text) ? { text: block.text } : {}) });
  }
  if (rawType === 'image') {
    if ((block.src === undefined || block.src === '') && boundedText(block.text)) {
      warning(warnings, path, 'image source is missing; description retained');
      return withMetadata({ type: 'image-description', text: block.text });
    }
    if (!boundedText(block.src, 2000)) return unsupported('image block requires a source URL or a text description');
    if (!boundedText(block.alt, 500)) return unsupported('image block requires non-empty alt text (maximum 500 characters)');
    if (block.caption !== undefined && !boundedText(block.caption, 2000)) return unsupported('image caption must be non-empty text of at most 2000 characters');
    return withMetadata({ type: 'image', src: block.src, alt: block.alt, ...(typeof block.caption === 'string' ? { caption: block.caption } : {}) });
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

function parseLearningChunks(value: unknown, path: string, blockCount: number, knownQuestions: Set<string>, warnings: string[]): LearningChunk[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 100) {
    warning(warnings, path, 'learningChunks must be an array of at most 100 chunks');
    return undefined;
  }
  const seenIds = new Set<string>(), seenBlocks = new Set<number>();
  const chunks: LearningChunk[] = [];
  for (const [index, raw] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(raw) || typeof raw.id !== 'string' || !safeId.test(raw.id) || seenIds.has(raw.id)) {
      warning(warnings, itemPath, 'chunk ID is invalid or duplicated; chunk was ignored');
      continue;
    }
    if (raw.title !== undefined && !boundedText(raw.title, 500)) {
      warning(warnings, `${itemPath}.title`, 'invalid chunk title; chunk was ignored');
      continue;
    }
    if (raw.pages !== undefined && !parseSectionPages(raw.pages)) {
      warning(warnings, `${itemPath}.pages`, 'invalid chunk page reference; chunk was ignored');
      continue;
    }
    if (!Array.isArray(raw.blockIndexes) || raw.blockIndexes.length < 1
      || !raw.blockIndexes.every(blockIndex => Number.isInteger(blockIndex) && (blockIndex as number) >= 0 && (blockIndex as number) < blockCount)) {
      warning(warnings, `${itemPath}.blockIndexes`, 'blockIndexes must reference existing lesson blocks; chunk was ignored');
      continue;
    }
    const blockIndexes = raw.blockIndexes as number[];
    if (blockIndexes.some((blockIndex, position) => position > 0 && blockIndex <= blockIndexes[position - 1] || seenBlocks.has(blockIndex))) {
      warning(warnings, `${itemPath}.blockIndexes`, 'block indexes must be ordered and cannot be repeated; chunk was ignored');
      continue;
    }
    if (!Array.isArray(raw.questionIds) || raw.questionIds.length < 1 || raw.questionIds.length > 3
      || !raw.questionIds.every(questionId => typeof questionId === 'string' && knownQuestions.has(questionId))) {
      warning(warnings, `${itemPath}.questionIds`, 'each learning chunk must reference one to three known questions; chunk was ignored');
      continue;
    }
    const questionIds = [...new Set(raw.questionIds as string[])];
    if (questionIds.length !== raw.questionIds.length) {
      warning(warnings, `${itemPath}.questionIds`, 'duplicate question references are not allowed; chunk was ignored');
      continue;
    }
    seenIds.add(raw.id);
    blockIndexes.forEach(blockIndex => seenBlocks.add(blockIndex));
    chunks.push({
      id: raw.id,
      ...(typeof raw.title === 'string' ? { title: raw.title } : {}),
      ...(typeof raw.pages === 'string' ? { pages: raw.pages.replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/\s*[–-]\s*/g, '–') } : {}),
      blockIndexes: [...blockIndexes],
      questionIds,
    });
  }
  if (!chunks.length) return undefined;
  if (seenBlocks.size !== blockCount || Array.from({ length: blockCount }, (_, index) => index).some(index => !seenBlocks.has(index))) {
    warning(warnings, path, 'learning chunks must cover every lesson block exactly once; chunks were ignored');
    return undefined;
  }
  return chunks;
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
    const learningChunks = parseLearningChunks(raw.learningChunks, `${path}.learningChunks`, concept.blocks.length, knownQuestions, warnings);
    if (learningChunks) {
      concept.learningChunks = learningChunks;
      const existing = new Set(concept.checkQuestionIds);
      for (const chunk of learningChunks) for (const questionId of chunk.questionIds) {
        if (!existing.has(questionId)) { existing.add(questionId); concept.checkQuestionIds.push(questionId); }
      }
    }
    concepts.push(concept);
  }
  return concepts;
}

function parseSectionPages(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 40) return false;
  const parts = value.replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).match(/^\s*(\d{1,5})(?:\s*[-–]\s*(\d{1,5}))?\s*$/);
  return !!parts && Number(parts[1]) >= 1 && (!parts[2] || Number(parts[2]) >= Number(parts[1]));
}

function parseSections(value: unknown, lessonId: string, concepts: Concept[], knownQuestions: Set<string>, warnings: string[]): LessonSectionDefinition[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    warning(warnings, `lessons.${lessonId}.sections`, 'sections must be an array');
    return [];
  }
  const knownConcepts = new Set(concepts.map(concept => concept.id));
  const usedSectionIds = new Set<string>();
  const sections: LessonSectionDefinition[] = [];
  for (const [index, raw] of value.entries()) {
    const path = `lessons.${lessonId}.sections[${index}]`;
    if (!isRecord(raw) || typeof raw.id !== 'string' || !safeId.test(raw.id) || !boundedText(raw.title, 500) || !parseSectionPages(raw.pages)) {
      warning(warnings, path, 'invalid section was ignored');
      continue;
    }
    if (usedSectionIds.has(raw.id)) {
      warning(warnings, path, `duplicate section id ${raw.id} was ignored`);
      continue;
    }
    usedSectionIds.add(raw.id);
    const readIds = (field: 'conceptIds' | 'learnQuestionIds' | 'practiceQuestionIds', allowed: Set<string>) => {
      if (!Array.isArray(raw[field])) {
        warning(warnings, `${path}.${field}`, `${field} must be an array`);
        return [];
      }
      const seen = new Set<string>();
      return (raw[field] as unknown[]).flatMap(id => {
        if (typeof id !== 'string' || !allowed.has(id)) {
          warning(warnings, `${path}.${field}`, `missing or invalid reference ${String(id)} was dropped`);
          return [];
        }
        if (seen.has(id)) {
          warning(warnings, `${path}.${field}`, `duplicate reference ${id} was dropped`);
          return [];
        }
        seen.add(id);
        return [id];
      });
    };
    sections.push({
      id: raw.id,
      title: raw.title,
      pages: raw.pages.replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/\s*[–-]\s*/g, '–'),
      conceptIds: readIds('conceptIds', knownConcepts),
      learnQuestionIds: readIds('learnQuestionIds', knownQuestions),
      practiceQuestionIds: readIds('practiceQuestionIds', knownQuestions),
    });
  }
  return sections;
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
    const sections = parseSections(raw.sections, raw.id, lesson.concepts, knownQuestions, warnings);
    if (sections) lesson.sections = sections;
    if (typeof raw.pages === 'string' && raw.pages.length <= 100) lesson.pages = raw.pages;
    else if (raw.pages !== undefined) warning(warnings, `${path}.pages`, 'invalid page reference was ignored');
    lessons.push(lesson);
  }
  return { lessons, warnings };
}

export function parseDifficulty(value: unknown): Difficulty | undefined {
  return value === 1 || value === 2 || value === 3 ? value : undefined;
}
