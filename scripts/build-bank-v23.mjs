#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = resolve(process.argv[2] ?? `${root}/data/MATH_QUESTION_BANK_v22.json`);
const outputPath = resolve(process.argv[3] ?? `${root}/data/MATH_QUESTION_BANK_v23.json`);
const source = JSON.parse(await readFile(inputPath, 'utf8'));
if (source.version !== 'v22') throw new Error(`Expected v22 input, got ${String(source.version)}.`);
if (!source.chapter?.id || !Array.isArray(source.lessons) || !Array.isArray(source.questions)) throw new Error('The source bank is missing chapter, lesson, or question data.');

const chapterId = source.chapter.id;
const questionById = new Map(source.questions.map(question => [question.id, question]));
const interactionCycle = ['multiple-choice', 'true-false-why', 'find-mistake', 'explain'];
let addedChunkChecks = 0;
let addedMorePractice = 0;
const chunksByLesson = {};

function normalizeChunkQuote(text) {
  return String(text).replace(/\s+/g, ' ').trim().replace(/[.،:;]+$/u, '');
}

function exactQuoteFromChunk(concept, chunk) {
  for (const blockIndex of chunk.blockIndexes) {
    const block = concept.blocks[blockIndex];
    if (!block || !['paragraph', 'definition', 'note'].includes(block.type) || typeof block.text !== 'string') continue;
    const sentence = block.text.split(/(?<=[.!?؟؛])\s+/u).map(normalizeChunkQuote).find(value => value.length >= 24 && value.length <= 250);
    if (sentence) return sentence;
  }
  return undefined;
}

function taggedQuestion(question, lesson, concept, skill) {
  question.tags = { chapter: chapterId, lesson: lesson.id, concept: concept.id, skill };
}

function sectionFor(lesson, concept, question) {
  return lesson.sections?.find(section => section.id === question.sectionId)
    ?? lesson.sections?.find(section => section.conceptIds.includes(concept.id));
}

function bookAnchorFor(lesson, concept, section) {
  const exact = section.practiceQuestionIds.map(id => questionById.get(id))
    .find(question => question?.origin === 'textbook' && question.conceptId === concept.id);
  if (exact) return exact;
  // The chapter-opening S&P graph is the book's worked source for the introduction concept.
  if (lesson.id === 'PC-1.1' && concept.id === 'PC-1.1-C01') return questionById.get('PC-1.1-L01');
  const sectionIndex = lesson.sections?.findIndex(item => item.id === section.id) ?? -1;
  for (let index = sectionIndex - 1; index >= 0; index--) {
    const earlier = lesson.sections?.[index];
    const candidate = earlier?.practiceQuestionIds.map(id => questionById.get(id))
      .find(question => question?.origin === 'textbook');
    if (candidate) return candidate;
  }
  return undefined;
}

function addChunkCheck(lesson, concept, chunk, slot, chunkIndex) {
  const id = `${chunk.id}-Q0${slot + 1}`;
  if (questionById.has(id)) throw new Error(`Duplicate chunk check id: ${id}`);
  let question;
  const requestedType = interactionCycle[(chunkIndex + slot) % interactionCycle.length];
  const quote = exactQuoteFromChunk(concept, chunk);
  if (!quote) throw new Error(`${chunk.id}: no short passage is available for a chunk-specific check.`);
  if (requestedType === 'multiple-choice') {
    question = {
      id,
      mode: 'text',
      answerType: 'choice',
      source: quote,
      prompt: 'آیا گزارهٔ بالا عیناً در متن همین گام آمده است؟ گزینه را انتخاب کن و با اشاره به خود متن دلیل بنویس.',
      choices: ['بله، در متن آمده است', 'خیر، در متن نیامده است'],
      requiresExplanation: true,
      interactionType: 'multiple-choice',
    };
  } else if (requestedType === 'true-false-why') {
    question = {
      id, mode: 'text', answerType: 'choice', interactionType: 'true-false-why',
      source: quote,
      prompt: 'این گزاره را با توجه به متن همین گام درست یا نادرست انتخاب کن؛ سپس با اشاره به خود متن دلیل بنویس.',
      choices: ['درست است', 'نادرست است'],
      requiresExplanation: true,
    };
  } else if (requestedType === 'find-mistake') {
    question = {
      id, mode: 'text', answerType: 'text', interactionType: 'find-mistake',
      source: quote,
      prompt: 'یک برداشت اشتباهِ ممکن از گزارهٔ بالا بنویس؛ سپس با تکیه بر همین متن، محل خطا را پیدا کن و برداشت را اصلاح کن.',
    };
  } else {
    question = {
      id, mode: 'text', answerType: 'text', interactionType: 'explain',
      source: quote,
      prompt: 'گزارهٔ بالا را با زبان خودت توضیح بده و بگو از متن همین گام چه نکته‌ای یاد گرفتی.',
    };
  }
  question.lessonId = lesson.id;
  question.conceptId = concept.id;
  question.stage = 'learn';
  question.origin = 'generated';
  question.sectionId = lesson.sections?.find(section => section.conceptIds?.includes(concept.id))?.id;
  question.difficulty = 1;
  taggedQuestion(question, lesson, concept, `${concept.id}-${question.interactionType ?? 'explain'}`);
  questionById.set(id, question);
  concept.checkQuestionIds.push(id);
  chunk.questionIds.push(id);
  const section = lesson.sections?.find(item => item.conceptIds?.includes(concept.id));
  if (section) section.learnQuestionIds.push(id);
  addedChunkChecks++;
}

function addExtraPractice(lesson, concept, section, conceptIndex) {
  const assigned = section.practiceQuestionIds.map(id => questionById.get(id))
    .filter(question => question?.conceptId === concept.id && question.stage === 'practice');
  // The introductory S&P concept deliberately has no separate book exercises. Its own
  // source-based check is reused as practice; all other extras repeat an assigned book item.
  const exemplar = assigned.find(question => question.origin === 'textbook')
    ?? assigned[0]
    ?? concept.checkQuestionIds.map(id => questionById.get(id)).find(question => question?.lessonId === lesson.id && question.conceptId === concept.id);
  if (!exemplar) throw new Error(`${concept.id}: no section exercise or concept check is available to anchor extra practice.`);
  const exactPrompt = exemplar.prompt ?? exemplar.source;
  const extraPrompts = [
    { suffix: 'MORE-01', interactionType: exemplar.interactionType ?? (exemplar.mode === 'math' ? 'step-by-step' : 'typed'), answerType: exemplar.answerType ?? (exemplar.mode === 'math' ? 'math' : 'text'), prompt: `تمرین اضافه (هم‌سطح کتاب) · بازتمرین: ${exactPrompt}` },
    { suffix: 'MORE-02', interactionType: 'explain', answerType: 'text', prompt: `تمرین اضافه (هم‌سطح کتاب) · برای حل این سؤال، اول داده‌ها و چیزی را که باید پیدا کنی مشخص کن؛ بعد روش شروع را با زبان خودت توضیح بده. سؤال: ${exactPrompt}` },
    { suffix: 'MORE-03', interactionType: 'find-mistake', answerType: 'text', prompt: `تمرین اضافه (هم‌سطح کتاب) · برای همین سؤال یک گامِ اشتباهِ محتمل بنویس؛ سپس خطا را با توجه به خواسته و مفهوم همین سؤال پیدا و اصلاح کن. سؤال: ${exactPrompt}` },
  ];
  for (const [index, item] of extraPrompts.entries()) {
    const id = `${concept.id}-${item.suffix}`;
    if (questionById.has(id)) throw new Error(`Duplicate extra-practice id: ${id}`);
    const question = {
      id, mode: exemplar.mode, answerType: item.answerType, interactionType: item.interactionType,
      prompt: item.prompt, source: exemplar.source, ...(index === 0 && exemplar.choices ? { choices: [...exemplar.choices] } : {}),
      ...(index === 0 && exemplar.requiresExplanation ? { requiresExplanation: true } : {}),
      lessonId: lesson.id, conceptId: concept.id,
      stage: 'practice', origin: 'generated', difficulty: 1, sectionId: section.id,
    };
    taggedQuestion(question, lesson, concept, `${concept.id}-${item.interactionType}`);
    questionById.set(id, question);
    section.practiceQuestionIds.push(id);
    addedMorePractice++;
  }
}

for (const [lessonIndex, lesson] of source.lessons.entries()) {
  if (!/^PC-1\.[1-7]$/.test(lesson.id) || !source.chapter.lessonIds.includes(lesson.id)) continue;
  let lessonChunks = 0;
  for (const [conceptIndex, concept] of lesson.concepts.entries()) {
    const section = lesson.sections?.find(item => item.conceptIds?.includes(concept.id));
    if (!section) throw new Error(`${concept.id}: no section is assigned.`);
    for (const [chunkIndex, chunk] of (concept.learningChunks ?? []).entries()) {
      if (chunk.questionIds.length > 3) throw new Error(`${chunk.id}: more than three checks already exist.`);
      for (const id of chunk.questionIds) {
        const existing = questionById.get(id);
        if (!existing) throw new Error(`${chunk.id}: missing existing check ${id}.`);
        existing.tags = { chapter: chapterId, lesson: lesson.id, concept: concept.id, skill: `${concept.id}-core` };
        existing.interactionType ??= existing.answerType === 'choice' ? 'multiple-choice' : 'typed';
      }
      while (chunk.questionIds.length < 3) addChunkCheck(lesson, concept, chunk, chunk.questionIds.length, chunkIndex + conceptIndex + lessonIndex);
      lessonChunks++;
    }
    addExtraPractice(lesson, concept, section, conceptIndex);
  }
  chunksByLesson[lesson.id] = lessonChunks;
}

const chapterLessonIds = new Set(source.lessons.filter(lesson => /^PC-1\.[1-7]$/.test(lesson.id)).map(lesson => lesson.id));
for (const question of questionById.values()) {
  if (!chapterLessonIds.has(question.lessonId)) continue;
  const lesson = source.lessons.find(item => item.id === question.lessonId);
  const concept = lesson?.concepts.find(item => item.id === question.conceptId);
  if (!lesson || !concept) throw new Error(`${question.id}: Chapter 1 question has no matching concept.`);
  const section = sectionFor(lesson, concept, question);
  if (!section || !section.conceptIds.includes(concept.id)) throw new Error(`${question.id}: no matching section exists in the lesson flow.`);
  question.sectionId = section.id;
  const isBook = question.origin === 'textbook' || question.id === 'PC-1.1-L01';
  const modeledOn = isBook ? undefined : bookAnchorFor(lesson, concept, section);
  if (!isBook && !modeledOn) throw new Error(`${question.id}: no current-or-earlier book item can anchor this extra item.`);
  question.tags = {
    chapter: chapterId,
    lesson: lesson.id,
    section: section.id,
    concept: concept.id,
    skill: question.tags?.skill ?? `${concept.id}-core`,
    source: isBook ? 'book' : 'extra',
    ...(modeledOn ? { modeledOn: modeledOn.id } : {}),
  };
  question.interactionType ??= question.answerType === 'choice' ? 'multiple-choice' : question.answerType === 'math' || question.mode === 'math' ? 'step-by-step' : 'typed';
}

for (const lesson of source.lessons.filter(item => /^PC-1\.[1-7]$/.test(item.id))) for (const concept of lesson.concepts) {
  const section = lesson.sections?.find(item => item.conceptIds.includes(concept.id));
  if (!section) throw new Error(`${concept.id}: no section is assigned for its supplemental examples.`);
  for (const block of concept.blocks) {
    if (block.type !== 'example' || !String(block.title ?? '').includes('مثال آموزشی تکمیلی')) continue;
    if (lesson.id === 'PC-1.2' && concept.id === 'PC-1.2-C04') {
      block.text = 'دامنه و برد تابع داده‌شده را پیدا کن.';
      block.latex = 'f(x)=\\frac{1}{x}';
    }
    if (lesson.id === 'PC-1.5' && concept.id === 'PC-1.5-C05' && block.text?.includes('مجانب')) {
      block.text = 'تابع پایهٔ وارون را با فرمول نشان‌داده‌شده منتقل کن.';
      block.latex = 'g(x)=\\frac{1}{x-1}+1';
      block.steps = [
        'در ورودی، x با x−1 جایگزین شده است؛ نمودار یک واحد به راست منتقل می‌شود.',
        'عدد +1 بیرون تابع قرار دارد؛ نمودار یک واحد به بالا می‌رود.',
      ];
    }
    if (lesson.id === 'PC-1.6' && concept.id === 'PC-1.6-C03' && block.text?.includes('تقاطع دو نمودار')) {
      block.text = 'معادله را با بررسی دو حالت قدرمطلق حل کن.';
      block.latex = '|x|=x+2';
      block.steps = [
        'اگر x≥0، آنگاه |x|=x و معادلهٔ x=x+2 جوابی ندارد.',
        'اگر x<0، آنگاه |x|=−x. حل −x=x+2 مقدار x=−1 را می‌دهد که شرط را دارد.',
      ];
    }
    const anchor = bookAnchorFor(lesson, concept, section);
    if (!anchor) throw new Error(`${concept.id}: no book item anchors supplemental example ${String(block.title)}.`);
    block.source = 'extra';
    block.modeledOn = anchor.id;
  }
}

source.questions = [...questionById.values()];
source.version = 'v23';
if (source.questions.length > 1500) throw new Error(`v23 would contain ${source.questions.length} questions; bank limit is 1500.`);
const text = `${JSON.stringify(source, null, 2)}\n`;
if (text.length > 2_000_000) throw new Error(`v23 would be ${text.length} characters; parser limit is 2,000,000.`);
await writeFile(outputPath, text, 'utf8');
console.log(JSON.stringify({ input: inputPath, output: outputPath, version: source.version, questions: source.questions.length, characters: text.length, addedChunkChecks, addedMorePractice, chunksByLesson }, null, 2));
