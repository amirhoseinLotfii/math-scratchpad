import { ascii, blankStep, leaves, MAX_SESSION_EXERCISES, uid, type Document, type Exercise } from '../../model';
import { newSessionMeta, type ScratchState } from '../../store';
import { parse } from '../../parser';
import { serialize, validateSession } from '../../persistence';
import { parseDifficulty, parseLessons } from '../lessons/parse';
import type { Lesson, QuestionLessonFields } from '../lessons/types';

export const BANK_SCHEMA = 'math-scratchpad.bank/1.0';
/** A single bank may contain an entire lesson section; session storage supports the same bound. */
export const MAX_QUESTIONS_PER_BANK = MAX_SESSION_EXERCISES;
export const ARCHIVE_KEY = 'math-scratchpad-drive-session-archive-v1';
export type BankQuestion = { id: string; mode: 'math' | 'text'; source: string; prompt?: string; /** Optional (bank 1.0 backward-compatible extension): hint-only guidance, never a solution. */ guidance?: string; answerType?: 'math' | 'text' | 'choice'; choices?: string[] } & QuestionLessonFields;
export type DriveBank = { schema_version: string; bank_id: string; version: string; questions: BankQuestion[]; lessons?: Lesson[]; parseWarnings?: string[] };
const safeId = /^[\w.-]{1,80}$/;
const FORBIDDEN_SEGMENTS = new Set(['answer', 'answers', 'solution', 'solutions', 'correct', 'key', 'keys', 'expected', 'rubric', 'verification']);
/** Splits a field name into words (answer_key, answerKey, ANSWER-KEY, answer.key -> answer, key), so "keyboard" or "monkey" are not flagged. */
export function forbiddenKey(name: string): boolean {
  if (name.toLowerCase() === 'answertype') return false;
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.some(w => FORBIDDEN_SEGMENTS.has(w)) || words.join('_') === 'final_answer';
}
/** Returns the path of the first answer/key-like field anywhere in the JSON, or null. */
export function findForbiddenKey(value: unknown, path = '', depth = 0): string | null {
  if (depth > 64 || !value || typeof value !== 'object') return null;
  for (const [k, v] of Object.entries(value)) {
    const here = Array.isArray(value) ? `${path}[${k}]` : path ? `${path}.${k}` : k;
    if (!Array.isArray(value) && forbiddenKey(k)) return here;
    const inner = findForbiddenKey(v, here, depth + 1); if (inner) return inner;
  }
  return null;
}

const OMIT = Symbol('omit-answer-like-content');
function stripAnswerLikeFields(value: unknown, path: string, warnings: string[], depth = 0): unknown | typeof OMIT {
  if (depth > 64) {
    warnings.push(`${path || 'bank'}: content deeper than 64 levels was ignored`);
    return OMIT;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => stripAnswerLikeFields(item, `${path}[${index}]`, warnings, depth + 1)).filter(item => item !== OMIT);
  }
  if (!value || typeof value !== 'object') return value;
  const clean = Object.create(null) as Record<string, unknown>;
  for (const [key, item] of Object.entries(value)) {
    const here = path ? `${path}.${key}` : key;
    if (forbiddenKey(key)) {
      warnings.push(`${here}: answer-like field was removed`);
      continue;
    }
    const next = stripAnswerLikeFields(item, here, warnings, depth + 1);
    if (next !== OMIT) clean[key] = next;
  }
  return clean;
}

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
    if (q.answerType === 'math' || q.answerType === 'text' || q.answerType === 'choice') question.answerType = q.answerType;
    else if (q.answerType !== undefined) warnings.push(`questions[${index}].answerType: unsupported answer type was ignored`);
    if (q.choices !== undefined) {
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
    questions.push(question);
  }

  const parsedLessons = parseLessons(data.lessons, questions.map(question => question.id));
  warnings.push(...parsedLessons.warnings);
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

  return {
    schema_version: BANK_SCHEMA,
    bank_id: data.bank_id,
    version: data.version,
    questions,
    ...(data.lessons !== undefined ? { lessons: parsedLessons.lessons } : {}),
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
export function bankDocument(bank: DriveBank, version: string, includedQuestions: BankQuestion[] = bank.questions.filter(question => question.stage !== 'learn')): Document {
  if (!includedQuestions.length) throw Error('No practice questions are available in this bank yet.');
  const exercises: Exercise[] = includedQuestions.map(q => ({ id: uid(), bankQuestionId: q.id, mode: q.mode, source: q.source, ...(q.prompt ? { prompt: q.prompt } : {}), ...(q.guidance ? { guidance: q.guidance } : {}), stage: q.stage ?? 'practice', ...(q.conceptId ? { conceptId: q.conceptId } : {}), steps: [blankStep()] }));
  const first = exercises[0], step = first.steps[0];
  return { session: { ...newSessionMeta(), bankId: bank.bank_id, bankVersion: version }, exercises, exerciseId: first.id, cursor: { stepId: step.id, nodeId: leaves(step.expression)[0].node.id, sequenceId: null, index: 0, offset: 0, selected: null } };
}
export type ArchivedSession = { id: string; savedAt: string; data: string };
export function readArchive(): ArchivedSession[] {
  const raw = localStorage.getItem(ARCHIVE_KEY);
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.some(x => !x || typeof x.id !== 'string' || typeof x.savedAt !== 'string' || typeof x.data !== 'string')) throw Error('Saved sessions could not be read. The current session was preserved.');
  return value as ArchivedSession[];
}
/** Never switch away until the current session is safely saved and read back. */
export function archiveSession(state: ScratchState): void {
  if (state.storageState) throw Error('Resolve the current session storage warning or conflict first.');
  const id = state.doc.session?.id ?? uid(), data = serialize(state);
  validateSession(JSON.parse(data));
  const all = readArchive();
  const next = all.some(x => x.id === id && x.data === data) ? all : [...all, { id, savedAt: new Date().toISOString(), data }];
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(next));
  if (!readArchive().some(x => x.id === id && x.data === data)) throw Error('The saved session could not be verified.');
}

/** User-facing message for a failed Drive call. */
export function driveError(status: number, action: string): Error {
  if (status === 401) return Error('Google authorization expired. Reconnect to continue.');
  if (status === 403) return Error(`${action}: Google denied access (403). Choose the bank file again or check the Drive API configuration.`);
  if (status === 404) return Error(`${action}: the file was not found or was not granted to this app (404). Choose it again.`);
  if (status === 429 || status >= 500) return Error(`${action}: Google is temporarily unavailable (${status}). The app will retry later.`);
  return Error(`${action} failed (${status}).`);
}
export const EMPTY_BANK = 'EMPTY_BANK';
/** Parse bank text; an empty file is a valid "no questions yet" state, not a crash. */
export function parseBankText(body: string): DriveBank | typeof EMPTY_BANK {
  if (body.length > 1000000) throw Error('The bank file is too large.');
  if (!body.replace(/^\uFEFF/, '').trim()) return EMPTY_BANK;
  let json: unknown;
  try { json = JSON.parse(body.replace(/^\uFEFF/, '')); } catch { throw Error('The bank file is not valid JSON. The current session was not changed.'); }
  const bank = validateBank(json);
  if (import.meta.env.DEV && bank.parseWarnings?.length) console.warn('[Math Scratchpad] Bank content warnings:', bank.parseWarnings);
  return bank;
}
export type DriveMeta = { id: string; name: string; mimeType: string; size?: string; md5Checksum?: string; modifiedTime?: string; headRevisionId?: string; version?: string; trashed?: boolean };
const validFileId = (id: string) => /^[A-Za-z0-9_-]{10,150}$/.test(id);
/** Cheap metadata request used for change detection; content is downloaded only when this changes. */
export async function readDriveMeta(fileId: string, token: string): Promise<DriveMeta> {
  if (!validFileId(fileId)) throw Error('Invalid Google Drive file ID.');
  const fields = 'id,name,mimeType,size,md5Checksum,modifiedTime,headRevisionId,version,trashed';
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${fields}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) throw driveError(response.status, 'Reading file metadata');
  const meta = await response.json() as DriveMeta;
  if (meta.trashed) throw Error('The bank file is in the Google Drive trash.');
  if (meta.mimeType === 'application/vnd.google-apps.document') throw Error('The bank file is a Google Doc. Select a regular .json file.');
  return meta;
}
/** Fingerprint of Drive metadata; any content edit changes md5Checksum/headRevisionId/version. */
export function metaFingerprint(meta: DriveMeta): string {
  return [meta.id, meta.md5Checksum ?? '', meta.headRevisionId ?? '', meta.version ?? '', meta.size ?? '', meta.modifiedTime ?? ''].join('|');
}
export async function readPrivateBankText(fileId: string, token: string): Promise<string> {
  if (!validFileId(fileId)) throw Error('Invalid Google Drive file ID.');
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) throw driveError(response.status, 'Reading the question bank');
  return response.text();
}
export async function readPrivateBank(fileId: string, token: string): Promise<DriveBank | typeof EMPTY_BANK> {
  return parseBankText(await readPrivateBankText(fileId, token));
}
