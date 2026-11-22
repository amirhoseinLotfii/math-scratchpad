import type { AnswerType, BankQuestion, DriveBank, DriveBankChapter } from '../entities/drive-bank.types';
import { ascii } from '../math/math-ast';
import { parse } from '../math/math-parser';
import { stripAnswerLikeFields } from './bank-sanitization';
import { parseDifficulty, parseLessons } from './lesson-parser';

export const BANK_SCHEMA = 'math-scratchpad.bank/1.0';
/** A chapter bank may span many lessons; each launched practice session stays within MAX_SESSION_EXERCISES. */
export const MAX_QUESTIONS_PER_BANK = 1000;
export const EMPTY_BANK = 'EMPTY_BANK';
const safeId = /^[\w.-]{1,80}$/;

export function validateBank(input: unknown): DriveBank {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('The bank must be a JSON object.');
  const warnings: string[] = [];
  const stripped = stripAnswerLikeFields(input, '', warnings);
  if (!stripped || typeof stripped !== 'object' || Array.isArray(stripped)) throw Error('The bank must be a JSON object.');
  const data = stripped as Record<string, unknown>;
  if (data.schema_version !== BANK_SCHEMA) throw Error(`Invalid bank schema. schema_version must be ${BANK_SCHEMA}.`);
  if (typeof data.bank_id !== 'string' || !safeId.test(data.bank_id)) throw Error('Invalid bank_id. Use a short, valid identifier.');
  if (typeof data.version !== 'string' || !safeId.test(data.version)) throw Error('Invalid bank version. Use a short, valid identifier.');
  if (!Array.isArray(data.questions)) throw Error('Invalid bank structure. questions must be an array.');
  if (data.questions.length > MAX_QUESTIONS_PER_BANK) throw Error(`This bank can contain up to ${MAX_QUESTIONS_PER_BANK} questions.`);
  const ids = new Set<string>(), questions: BankQuestion[] = [];
  for (const [index, entry] of data.questions.entries()) {
    const path = `questions[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw Error(`${path}: a question must be a JSON object.`);
    const q = entry as Record<string, unknown>;
    const questionRef = typeof q.id === 'string' && q.id ? `${path} (${q.id})` : path;
    if (typeof q.id !== 'string' || !safeId.test(q.id)) throw Error(`${questionRef}: id must be a short, valid identifier.`);
    if (!['math', 'text'].includes(String(q.mode))) throw Error(`${questionRef}: mode must be math or text.`);
    if (typeof q.source !== 'string' || !q.source.trim() || q.source.length > 4000) throw Error(`${questionRef}: source must be non-empty text up to 4000 characters.`);
    if (q.prompt !== undefined && (typeof q.prompt !== 'string' || q.prompt.length >= 4000)) throw Error(`${questionRef}: prompt must be text under 4000 characters.`);
    if (q.guidance !== undefined && (typeof q.guidance !== 'string' || !q.guidance.trim() || q.guidance.length > 2000)) throw Error(`${questionRef}: guidance must be non-empty text up to 2000 characters.`);
    if (ids.has(q.id)) { warnings.push(`questions[${index}]: duplicate question id ${q.id} was ignored`); continue; }
    ids.add(q.id);
    if (q.mode === 'math') {
      try { parse(ascii(q.source)); }
      catch (error) { throw Error(`${questionRef}: invalid math source. ${error instanceof Error ? error.message : 'Check the expression.'}`); }
    }
    const question: BankQuestion = { id: q.id, mode: q.mode as 'math' | 'text', source: q.source, ...(typeof q.prompt === 'string' ? { prompt: q.prompt } : {}), ...(typeof q.guidance === 'string' ? { guidance: q.guidance } : {}) };
    if (['math', 'text', 'choice', 'true_false_why', 'find_mistake'].includes(String(q.answerType))) question.answerType = q.answerType as AnswerType;
    else if (q.answerType !== undefined) warnings.push(`questions[${index}].answerType: unsupported answer type was ignored`);
    if (q.choices !== undefined && question.answerType === 'true_false_why') {
      warnings.push(`questions[${index}].choices: true_false_why uses the built-in True/False options; custom choices were ignored`);
    } else if (q.choices !== undefined) {
      if (Array.isArray(q.choices) && q.choices.length >= 2 && q.choices.length <= 12 && q.choices.every(choice => typeof choice === 'string' && choice.trim().length > 0 && choice.length <= 500)) question.choices = q.choices as string[];
      else warnings.push(`questions[${index}].choices: invalid choices were ignored`);
    }
    if (question.answerType === 'choice' && !question.choices) {
      warnings.push(`questions[${index}].choices: choice answer type requires at least two valid options`);
      delete question.answerType;
    }
    if (typeof q.lessonId === 'string' && safeId.test(q.lessonId)) question.lessonId = q.lessonId;
    else if (q.lessonId !== undefined) warnings.push(`questions[${index}].lessonId: invalid lesson reference was ignored`);
    if (typeof q.conceptId === 'string' && safeId.test(q.conceptId)) question.conceptId = q.conceptId;
    else if (q.conceptId !== undefined) warnings.push(`questions[${index}].conceptId: invalid concept reference was ignored`);
    if (q.stage === 'learn' || q.stage === 'practice') question.stage = q.stage;
    else if (q.stage !== undefined) warnings.push(`questions[${index}].stage: invalid stage was ignored`);
    const difficulty = parseDifficulty(q.difficulty);
    if (difficulty !== undefined) question.difficulty = difficulty;
    else if (q.difficulty !== undefined) warnings.push(`questions[${index}].difficulty: invalid difficulty was ignored`);
    if (q.origin === 'textbook' || q.origin === 'generated') question.origin = q.origin;
    else if (q.origin !== undefined) warnings.push(`questions[${index}].origin: invalid question origin was ignored`);
    if (typeof q.sectionId === 'string' && safeId.test(q.sectionId)) question.sectionId = q.sectionId;
    else if (q.sectionId !== undefined) warnings.push(`questions[${index}].sectionId: invalid section reference was ignored`);
    questions.push(question);
  }

  const parsedLessons = parseLessons(data.lessons, questions.map(question => question.id));
  warnings.push(...parsedLessons.warnings);
  let chapter: DriveBankChapter | undefined;
  if (data.chapter !== undefined) {
    const raw = data.chapter;
    const valid = !!raw && typeof raw === 'object' && !Array.isArray(raw);
    const record = valid ? raw as Record<string, unknown> : {};
    const knownLessonIds = new Set(parsedLessons.lessons.map(lesson => lesson.id));
    const lessonIds = Array.isArray(record.lessonIds)
      ? [...new Set(record.lessonIds.filter((id): id is string => typeof id === 'string' && /^[\w.-]{1,80}$/.test(id) && knownLessonIds.has(id)))]
      : [];
    if (!valid || typeof record.id !== 'string' || !/^[\w.-]{1,80}$/.test(record.id)
      || !Number.isInteger(record.number) || (record.number as number) < 1 || (record.number as number) > 99
      || typeof record.title !== 'string' || !record.title.trim() || record.title.length > 500
      || typeof record.source !== 'string' || !record.source.trim() || record.source.length > 1000
      || typeof record.pdfPages !== 'string' || !/^\d{1,5}\s*[–-]\s*\d{1,5}$/.test(record.pdfPages)
      || !Array.isArray(record.lessonIds) || lessonIds.length !== record.lessonIds.length || lessonIds.length !== parsedLessons.lessons.length) {
      warnings.push('chapter: invalid chapter metadata was ignored');
    } else {
      chapter = { id: record.id, number: record.number as number, title: record.title, source: record.source, pdfPages: record.pdfPages.replace(/\s*[–-]\s*/g, '–'), lessonIds };
    }
  }
  const lessonById = new Map(parsedLessons.lessons.map(lesson => [lesson.id, lesson]));
  const conceptToLesson = new Map<string, string>();
  for (const lesson of parsedLessons.lessons) for (const concept of lesson.concepts) conceptToLesson.set(concept.id, lesson.id);
  for (const [index, question] of questions.entries()) {
    if (question.lessonId && !lessonById.has(question.lessonId)) {
      warnings.push(`questions[${index}].lessonId: missing lesson ${question.lessonId}; lesson link was ignored`);
      delete question.lessonId;
      delete question.conceptId;
      if (question.stage === 'learn') question.stage = 'practice';
    } else if (question.conceptId && (!question.lessonId || conceptToLesson.get(question.conceptId) !== question.lessonId)) {
      warnings.push(`questions[${index}].conceptId: concept is not in the referenced lesson; question is treated as practice`);
      delete question.conceptId;
      question.stage = 'practice';
    }
    if (question.stage === 'learn' && (!question.lessonId || !question.conceptId)) {
      warnings.push(`questions[${index}]: learn question has no valid lesson and concept; question is treated as practice`);
      question.stage = 'practice';
    }
  }

  const questionById = new Map(questions.map(question => [question.id, question]));
  const assignedSectionByQuestion = new Map<string, { lessonId: string; sectionId: string; stage: 'learn' | 'practice' }>();
  for (const lesson of parsedLessons.lessons) for (const section of lesson.sections ?? []) {
    const keepAssigned = (questionIds: string[], stage: 'learn' | 'practice') => questionIds.filter(questionId => {
      const question = questionById.get(questionId);
      if (!question || question.lessonId !== lesson.id || (question.stage ?? 'practice') !== stage) {
        warnings.push(`lessons.${lesson.id}.sections.${section.id}: ${questionId} is not a ${stage} question in this lesson; reference was dropped`);
        return false;
      }
      const previous = assignedSectionByQuestion.get(questionId);
      if (previous && previous.sectionId !== section.id) {
        warnings.push(`lessons.${lesson.id}.sections.${section.id}: ${questionId} is already assigned to ${previous.sectionId}; duplicate reference was dropped`);
        return false;
      }
      if (question.sectionId && question.sectionId !== section.id) {
        warnings.push(`lessons.${lesson.id}.sections.${section.id}: ${questionId} has a different sectionId; reference was dropped`);
        return false;
      }
      question.sectionId = section.id;
      assignedSectionByQuestion.set(questionId, { lessonId: lesson.id, sectionId: section.id, stage });
      return true;
    });
    section.learnQuestionIds = keepAssigned(section.learnQuestionIds, 'learn');
    section.practiceQuestionIds = keepAssigned(section.practiceQuestionIds, 'practice');
  }
  for (const [index, question] of questions.entries()) {
    if (!question.sectionId) continue;
    const assignment = assignedSectionByQuestion.get(question.id);
    if (!assignment || assignment.lessonId !== question.lessonId || assignment.sectionId !== question.sectionId) {
      warnings.push(`questions[${index}].sectionId: no matching lesson section reference; section link was ignored`);
      delete question.sectionId;
    }
  }

  return {
    schema_version: BANK_SCHEMA,
    bank_id: data.bank_id,
    version: data.version,
    questions,
    ...(data.lessons !== undefined ? { lessons: parsedLessons.lessons } : {}),
    ...(chapter ? { chapter } : {}),
    ...(warnings.length ? { parseWarnings: warnings } : {}),
  };
}

/** Include a content digest in the version, even if the author forgot to bump it. */
export async function snapshotVersion(bank: DriveBank): Promise<string> {
  const { parseWarnings: _warnings, ...content } = bank;
  const bytes = new TextEncoder().encode(JSON.stringify(content));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const suffix = Array.from(new Uint8Array(hash)).slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join('');
  return `${bank.version.slice(0, 80)}-${suffix}`;
}
