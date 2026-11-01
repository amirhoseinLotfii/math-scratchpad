import type { Concept, Lesson, LessonBlock, LessonSectionDefinition, LearningChunk } from './types';

export type LessonSectionConcept = {
  concept: Concept;
  conceptIndex: number;
  blocks: LessonBlock[];
};

export type LessonSection = {
  id: string;
  title?: string;
  startPage?: number;
  endPage?: number;
  concepts: LessonSectionConcept[];
};

export type ActiveLessonChunk = {
  id: string;
  title: string;
  pages?: string;
  startPage?: number;
  endPage?: number;
  chunkIndex: number;
  chunkCount: number;
  concept: Concept;
  conceptIndex: number;
  blocks: LessonBlock[];
  blockIndexes: number[];
  questionIds: string[];
};

function latinDigits(value: string): string {
  return value.replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

export function pageRange(value?: string): [number, number] | undefined {
  if (!value) return undefined;
  const numbers = latinDigits(value).match(/\d+/g)?.map(Number).filter(Number.isFinite);
  if (!numbers?.length) return undefined;
  return [numbers[0], numbers.length > 1 ? numbers[1] : numbers[0]];
}

/** v22's short read/write units, kept separate so v21 section indexes remain stable. */
export function buildActiveLessonChunks(lesson: Lesson): ActiveLessonChunk[] {
  const result: ActiveLessonChunk[] = [];
  lesson.concepts.forEach((concept, conceptIndex) => {
    const chunks = concept.learningChunks;
    if (!chunks?.length) return;
    chunks.forEach((chunk: LearningChunk, chunkIndex) => {
      const blocks = chunk.blockIndexes.map(index => concept.blocks[index]).filter((block): block is LessonBlock => !!block);
      const pages = chunk.pages ?? concept.pages;
      const [startPage, endPage] = pageRange(pages) ?? [];
      result.push({
        id: chunk.id,
        title: chunk.title || concept.title,
        ...(pages ? { pages } : {}),
        ...(startPage ? { startPage, endPage } : {}),
        chunkIndex,
        chunkCount: chunks.length,
        concept,
        conceptIndex,
        blocks,
        blockIndexes: [...chunk.blockIndexes],
        questionIds: [...chunk.questionIds],
      });
    });
  });
  return result;
}

function blockPage(block: LessonBlock): number | undefined {
  return block.type !== 'unsupported' ? block.page : undefined;
}

function explicitSections(lesson: Lesson, definitions: LessonSectionDefinition[]): LessonSection[] {
  const conceptById = new Map(lesson.concepts.map((concept, conceptIndex) => [concept.id, { concept, conceptIndex }]));
  return definitions.flatMap(definition => {
    const [startPage, endPage] = pageRange(definition.pages) ?? [];
    const concepts = definition.conceptIds.flatMap(id => {
      const entry = conceptById.get(id);
      if (!entry) return [];
      const tagged = entry.concept.blocks.filter(block => blockPage(block) !== undefined);
      const unpaged = entry.concept.blocks.filter(block => blockPage(block) === undefined);
      const blocks = [
        ...entry.concept.blocks.filter(block => {
          const page = blockPage(block);
          return page !== undefined && startPage !== undefined && endPage !== undefined && page >= startPage && page <= endPage;
        }),
        ...(!tagged.length || definitions.findIndex(section => section.conceptIds.includes(id)) === definitions.indexOf(definition) ? unpaged : []),
      ];
      return blocks.length ? [{ ...entry, blocks }] : [];
    });
    return concepts.length ? [{ id: definition.id, title: definition.title, ...(startPage ? { startPage, endPage } : {}), concepts }] : [];
  });
}

/** Build short, ordered study sections from the source pages attached to lesson blocks. */
export function buildLessonSections(lesson: Lesson): LessonSection[] {
  if (lesson.sections?.length) return explicitSections(lesson, lesson.sections);
  const datedBlocks: Array<{ concept: Concept; conceptIndex: number; block: LessonBlock; page?: number }> = [];
  const allPages: number[] = [];
  lesson.concepts.forEach((concept, conceptIndex) => {
    const conceptPageRange = pageRange(concept.pages);
    if (conceptPageRange) allPages.push(...conceptPageRange);
    for (const block of concept.blocks) {
      const page = blockPage(block);
      if (page) allPages.push(page);
      datedBlocks.push({ concept, conceptIndex, block, page });
    }
  });

  // Old lesson banks may have page ranges but no page on individual blocks. Keep
  // each concept intact in that case instead of guessing where to cut its text.
  if (!datedBlocks.some(item => item.block.type !== 'unsupported' && item.block.page)) {
    return lesson.concepts.map((concept, conceptIndex) => {
      const [startPage, endPage] = pageRange(concept.pages) ?? [];
      return {
        id: `${lesson.id}-${concept.id}`,
        ...(startPage ? { startPage, endPage } : {}),
        concepts: [{ concept, conceptIndex, blocks: concept.blocks }],
      };
    });
  }

  const lessonStartPage = pageRange(lesson.pages)?.[0];
  const firstPage = lessonStartPage ? Math.min(lessonStartPage, ...allPages) : Math.min(...allPages);
  const lastPage = Math.max(...allPages);
  const sectionByStart = new Map<number, LessonSection>();
  const unpagedSection: LessonSection = { id: `${lesson.id}-UNPAGED`, concepts: [] };
  for (let startPage = firstPage; startPage <= lastPage; startPage += 2) {
    sectionByStart.set(startPage, {
      id: `${lesson.id}-P${startPage}-${Math.min(startPage + 1, lastPage)}`,
      startPage,
      endPage: Math.min(startPage + 1, lastPage),
      concepts: [],
    });
  }

  for (const item of datedBlocks) {
    if (item.page === undefined) {
      let entry = unpagedSection.concepts.find(candidate => candidate.concept.id === item.concept.id);
      if (!entry) {
        entry = { concept: item.concept, conceptIndex: item.conceptIndex, blocks: [] };
        unpagedSection.concepts.push(entry);
      }
      entry.blocks.push(item.block);
      continue;
    }
    const page = item.page;
    const startPage = firstPage + Math.floor((page - firstPage) / 2) * 2;
    const section = sectionByStart.get(startPage);
    if (!section) continue;
    let entry = section.concepts.find(candidate => candidate.concept.id === item.concept.id);
    if (!entry) {
      entry = { concept: item.concept, conceptIndex: item.conceptIndex, blocks: [] };
      section.concepts.push(entry);
    }
    entry.blocks.push(item.block);
  }

  return [...sectionByStart.values()].filter(section => section.concepts.length > 0)
    .concat(unpagedSection.concepts.length ? [unpagedSection] : []);
}
