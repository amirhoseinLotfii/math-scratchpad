import { readFile, stat } from 'node:fs/promises';

const bankPath = process.argv[2];
if (!bankPath) throw new Error('Usage: node analyze-template.mjs <bank.json>');

const [raw, metadata] = await Promise.all([readFile(bankPath, 'utf8'), stat(bankPath)]);
const bank = JSON.parse(raw);
const questions = Array.isArray(bank.questions) ? bank.questions : [];
const lessons = Array.isArray(bank.lessons) ? bank.lessons : [];
const blockCounts = Object.create(null);
const questionsByLesson = Object.create(null);
const conceptsByLesson = Object.create(null);
const stageCounts = Object.create(null);
const modeCounts = Object.create(null);
const answerTypeCounts = Object.create(null);
const originCounts = Object.create(null);
const sectionReferences = [];
const conceptCheckReferences = [];
let conceptCount = 0;
let maxBlocksPerConcept = 0;
let supplementaryExamples = 0;
let simpleIdeaNotes = 0;
let allQuestionsHaveAnswerType = true;
let forbiddenAnswerKeys = 0;

for (const lesson of lessons) {
  const concepts = Array.isArray(lesson.concepts) ? lesson.concepts : [];
  conceptsByLesson[lesson.id] = concepts.length;
  conceptCount += concepts.length;
  for (const concept of concepts) {
    const blocks = Array.isArray(concept.blocks) ? concept.blocks : [];
    maxBlocksPerConcept = Math.max(maxBlocksPerConcept, blocks.length);
    for (const block of blocks) {
      blockCounts[block.type] = (blockCounts[block.type] || 0) + 1;
      if (block.type === 'example' && /تکمیلی/.test(`${block.title || ''} ${block.text || ''}`)) supplementaryExamples++;
      if (block.type === 'note' && /^ایدهٔ ساده[:：]/.test(block.text || '')) simpleIdeaNotes++;
    }
    conceptCheckReferences.push(...(concept.checkQuestionIds || []));
  }
  for (const section of lesson.sections || []) {
    sectionReferences.push(...(section.learnQuestionIds || []), ...(section.practiceQuestionIds || []));
  }
}

for (const q of questions) {
  const lesson = q.lessonId || '(no lesson)';
  questionsByLesson[lesson] = (questionsByLesson[lesson] || 0) + 1;
  const stage = q.stage || '(missing)';
  const mode = q.mode || '(missing)';
  const answerType = q.answerType || '(missing)';
  const origin = q.origin || '(missing)';
  stageCounts[stage] = (stageCounts[stage] || 0) + 1;
  modeCounts[mode] = (modeCounts[mode] || 0) + 1;
  answerTypeCounts[answerType] = (answerTypeCounts[answerType] || 0) + 1;
  originCounts[origin] = (originCounts[origin] || 0) + 1;
  if (!q.answerType) allQuestionsHaveAnswerType = false;
  for (const key of Object.keys(q)) if (/^(answer|answers|solution|solutions|correct|key|keys)$/i.test(key)) forbiddenAnswerKeys++;
}

const questionIds = new Set(questions.map(q => q.id));
const sectionRefCounts = new Map();
for (const id of sectionReferences) sectionRefCounts.set(id, (sectionRefCounts.get(id) || 0) + 1);
const conceptCheckCounts = new Map();
for (const id of conceptCheckReferences) conceptCheckCounts.set(id, (conceptCheckCounts.get(id) || 0) + 1);
const sectionMissingReferences = [...sectionRefCounts.keys()].filter(id => !questionIds.has(id)).length;
const sectionDuplicateReferences = [...sectionRefCounts.values()].filter(count => count > 1).length;
const sectionUnreferencedQuestions = questions.filter(q => !sectionRefCounts.has(q.id)).length;
const idCounts = {
  L: questions.filter(q => /-L\d+$/.test(q.id)).length,
  X: questions.filter(q => /-X\d+$/.test(q.id)).length,
  R: questions.filter(q => /-R\d+$/.test(q.id)).length,
  T: questions.filter(q => /-T\d+$/.test(q.id)).length,
  other: questions.filter(q => !/-(?:L|X|R|T)\d+$/.test(q.id)).length,
};

const report = {
  source: 'OpenStax Precalculus 2e Chapter 1 bank (read-only template)',
  file: bankPath,
  bytesUtf8: metadata.size,
  utf16CodeUnits: raw.length,
  topLevelKeyOrder: Object.keys(bank),
  schema_version: bank.schema_version,
  bank_id: bank.bank_id,
  version: bank.version,
  chapter: bank.chapter,
  lessonCount: lessons.length,
  lessonIds: lessons.map(lesson => lesson.id),
  conceptsByLesson,
  conceptCount,
  maxBlocksPerConcept,
  blockCounts,
  questionCount: questions.length,
  questionIdsByType: idCounts,
  questionsByLesson,
  stageCounts,
  modeCounts,
  answerTypeCounts,
  originCounts,
  allQuestionsHaveAnswerType,
  supplementaryExamples,
  simpleIdeaNotes,
  sectionCount: lessons.reduce((sum, lesson) => sum + (lesson.sections || []).length, 0),
  sectionReferenceCount: sectionReferences.length,
  sectionMissingReferences,
  sectionDuplicateReferences,
  sectionUnreferencedQuestions,
  conceptCheckReferenceCount: conceptCheckReferences.length,
  conceptCheckMissingReferences: [...conceptCheckCounts.keys()].filter(id => !questionIds.has(id)).length,
  conceptCheckDuplicateReferences: [...conceptCheckCounts.values()].filter(count => count > 1).length,
  forbiddenAnswerKeysInQuestions: forbiddenAnswerKeys,
};

console.log('# Chapter 1 Template Statistics\n');
console.log('Generated from the read-only v21 bank; no question text or answer values are included.\n');
console.log('```json');
console.log(JSON.stringify(report, null, 2));
console.log('```');
