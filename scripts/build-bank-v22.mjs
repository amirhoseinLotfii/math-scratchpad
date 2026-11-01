#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = resolve(process.argv[2] ?? `${root}/MATH_QUESTION_BANK_v21.json`);
const outputPath = resolve(process.argv[3] ?? `${root}/data/MATH_QUESTION_BANK_v22.json`);
const source = JSON.parse(await readFile(inputPath, 'utf8'));
if (source.version !== 'v21') throw new Error(`Expected v21 input, got ${String(source.version)}.`);

const targetLessons = new Set(Array.from({ length: 7 }, (_, index) => `PC-1.${index + 1}`));
const questionById = new Map(source.questions.map(question => [question.id, question]));
let generated = 0;
let sanitizedExerciseBlocks = 0;
let addedTryItQuestions = 0;
const chunkCountByLesson = {};

const exerciseLead = /^\s*(?:try\s*it\b|تمرین\s*(?:شماره|[۰-۹\d]))/iu;
const textTypes = new Set(['paragraph', 'definition', 'note']);

function displayTopic(text) {
  return text.replace(/\s+/g, ' ').trim().replace(/[.،:;]+$/u, '').slice(0, 100);
}

function topicForChunk(concept, blocks) {
  const heading = [...blocks].reverse().find(block => block.type === 'heading' && displayTopic(block.text) !== displayTopic(concept.title));
  if (heading) return displayTopic(heading.text);
  const definition = blocks.find(block => block.type === 'definition');
  if (definition) {
    const first = displayTopic(definition.text).split(/[.!?؟؛]/u)[0];
    if (first.length >= 8 && first.length <= 84) return first;
  }
  return displayTopic(concept.title);
}

function makePrompt(concept, blocks, chunkNumber) {
  const topic = topicForChunk(concept, blocks);
  const hasDefinition = blocks.some(block => block.type === 'definition');
  const hasImage = blocks.some(block => block.type === 'image' || block.type === 'image-description');
  if (hasDefinition) return `بر اساس همین قسمت، تعریف «${topic}» را با زبان سادهٔ خودت بنویس.`;
  if (hasImage) return `از توضیح یا شکل همین قسمت، یک نکته دربارهٔ «${topic}» بنویس و آن را با کلمات خودت توضیح بده.`;
  if (chunkNumber % 3 === 1) return `طبق همین قسمت، «${topic}» را در یک یا دو جمله با زبان خودت توضیح بده.`;
  if (chunkNumber % 3 === 2) return `یک قاعده یا نکتهٔ مهمی را که همین قسمت دربارهٔ «${topic}» می‌گوید، با کلمات خودت بنویس.`;
  return `بعد از خواندن همین قسمت، چه چیزی دربارهٔ «${topic}» یاد گرفتی؟ در یک یا دو جمله بنویس.`;
}

function makeChunks(concept) {
  const chunks = [];
  let current = [];
  let paragraphCount = 0;
  const flush = () => {
    if (!current.length) return;
    chunks.push(current);
    current = [];
    paragraphCount = 0;
  };
  for (const [index, block] of concept.blocks.entries()) {
    const isText = textTypes.has(block.type) && typeof block.text === 'string' && block.text.trim();
    if (isText && paragraphCount >= 4) flush();
    current.push(index);
    if (isText) paragraphCount++;
  }
  flush();
  return chunks.length ? chunks : [concept.blocks.map((_, index) => index)];
}

function sanitizeExerciseSolution(block) {
  if (block.type !== 'example') return block;
  const title = typeof block.title === 'string' ? block.title : '';
  const text = typeof block.text === 'string' ? block.text : '';
  if (!exerciseLead.test(title) && !exerciseLead.test(text)) return block;
  sanitizedExerciseBlocks++;
  const prompt = [title, text].filter(Boolean).join(' — ');
  return {
    type: 'paragraph',
    ...(block.lang ? { lang: block.lang } : {}),
    ...(block.page ? { page: block.page } : {}),
    text: prompt,
    ...(typeof block.latex === 'string' && block.latex.trim() ? { latex: block.latex } : {}),
  };
}

function latinDigits(value) {
  return value.replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

function addTryItQuestion(lesson, concept, section, block) {
  const numberMatch = latinDigits(block.text).match(/تمرین\s*شماره\s*([0-9]+)/u);
  const number = Number(numberMatch?.[1] ?? addedTryItQuestions + 1);
  const id = `${concept.id}-TI${String(number).padStart(2, '0')}`;
  if (questionById.has(id)) throw new Error(`Duplicate Try It question id: ${id}`);
  const question = {
    id,
    mode: 'text',
    answerType: 'text',
    source: block.text,
    prompt: `تمرین درون‌درس · خودت امتحان کن · شمارهٔ ${number}`,
    lessonId: lesson.id,
    conceptId: concept.id,
    stage: 'practice',
    difficulty: 1,
    origin: 'textbook',
    sectionId: section.id,
  };
  questionById.set(id, question);
  section.practiceQuestionIds.push(id);
  addedTryItQuestions++;
  return question;
}

for (const lesson of source.lessons ?? []) {
  if (!targetLessons.has(lesson.id)) continue;
  const lessonQuestions = [];
  let lessonChunkCount = 0;
  for (const concept of lesson.concepts ?? []) {
    const section = lesson.sections?.find(item => item.conceptIds?.includes(concept.id));
    if (!section) throw new Error(`${concept.id}: no source lesson section found.`);
    const tryItQuestions = [];
    concept.blocks.forEach(block => {
      if (block.type === 'example' && exerciseLead.test(`${block.title ?? ''} ${block.text ?? ''}`)) {
        if (typeof block.text !== 'string' || !block.text.trim()) throw new Error(`${concept.id}: Try It block has no prompt text.`);
        tryItQuestions.push(addTryItQuestion(lesson, concept, section, block));
      }
    });
    concept.blocks = concept.blocks.map(sanitizeExerciseSolution);
    const groups = makeChunks(concept);
    const availableChecks = (concept.checkQuestionIds ?? []).filter(id => {
      const question = questionById.get(id);
      return question?.lessonId === lesson.id && question?.conceptId === concept.id && question?.stage === 'learn';
    });
    const idsByChunk = groups.map(() => []);
    availableChecks.forEach((id, index) => {
      idsByChunk[index % groups.length].push(id);
    });
    for (const [chunkIndex, blockIndexes] of groups.entries()) {
      const chunkNumber = chunkIndex + 1;
      const id = `${concept.id}-K${String(chunkNumber).padStart(2, '0')}`;
      const blocks = blockIndexes.map(index => concept.blocks[index]);
      const questionIds = idsByChunk[chunkIndex];
      if (questionIds.length === 0) {
        const questionId = `${id}-Q01`;
        const prompt = makePrompt(concept, blocks, chunkNumber);
        const question = {
          id: questionId,
          mode: 'text',
          source: prompt,
          answerType: 'text',
          lessonId: lesson.id,
          conceptId: concept.id,
          stage: 'learn',
          origin: 'generated',
          sectionId: section.id,
        };
        if (questionById.has(questionId)) throw new Error(`Duplicate generated question id: ${questionId}`);
        questionById.set(questionId, question);
        lessonQuestions.push(question);
        concept.checkQuestionIds.push(questionId);
        questionIds.push(questionId);
        section.learnQuestionIds.push(questionId);
        generated++;
      }
      const pageNumbers = [...new Set(blocks.map(block => block.page).filter(Number.isInteger))].sort((a, b) => a - b);
      concept.learningChunks ??= [];
      concept.learningChunks.push({
        id,
        title: topicForChunk(concept, blocks),
        blockIndexes,
        questionIds,
        ...(pageNumbers.length ? { pages: pageNumbers.length === 1 ? String(pageNumbers[0]) : `${pageNumbers[0]}–${pageNumbers.at(-1)}` } : {}),
      });
      lessonChunkCount++;
    }
    lessonQuestions.push(...tryItQuestions);
  }
  source.questions.push(...lessonQuestions);
  chunkCountByLesson[lesson.id] = lessonChunkCount;
}

source.version = 'v22';
if (source.questions.length > 1000) throw new Error(`v22 would contain ${source.questions.length} questions; bank limit is 1000.`);
await writeFile(outputPath, `${JSON.stringify(source, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ input: inputPath, output: outputPath, version: source.version, questions: source.questions.length, generatedChunkQuestions: generated, addedTryItQuestions, sanitizedExerciseBlocks, chunksByLesson: chunkCountByLesson }, null, 2));
