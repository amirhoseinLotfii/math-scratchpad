import { ascii, blankStep, leaves, uid, type Document, type Exercise } from '../../model';
import { newSessionMeta, type ScratchState } from '../../store';
import { metadataSchema } from '../session/schemas/session-schema';
import { parse } from '../../parser';
import { serialize, validateSession } from '../../persistence';

export const BANK_SCHEMA = 'math-scratchpad.bank/1.0';
export const ARCHIVE_KEY = 'math-scratchpad-drive-session-archive-v1';
export type BankQuestion = { answerType?: 'math' | 'text' | 'choice'; choices?: string[]; id: string; mode: 'math' | 'text'; source: string; prompt?: string; /** Optional (bank 1.0 backward-compatible extension): hint-only guidance, never a solution. */ guidance?: string };
export type DriveBank = { schema_version: string; bank_id: string; version: string; questions: BankQuestion[] };
const safeId = /^[\w.-]{1,80}$/;
const FORBIDDEN_SEGMENTS = new Set(['answer', 'answers', 'solution', 'solutions', 'key', 'keys', 'expected', 'rubric', 'verification']);
/** Splits a field name into words (answer_key, answerKey, ANSWER-KEY, answer.key -> answer, key), so "keyboard" or "monkey" are not flagged. */
export function forbiddenKey(name: string): boolean {
  if (name === 'answerType') return false; // Response UI metadata, never an answer key.
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
export function validateBank(input: unknown): DriveBank {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('ساختار بانک معتبر نیست.');
  const data = input as Record<string, unknown>;
  const leaked = findForbiddenKey(data);
  if (leaked) throw Error(`بانک سؤال نباید پاسخ یا کلید داشته باشد (فیلد «${leaked}»). فایل رد شد.`);
  if (data.schema_version !== BANK_SCHEMA || typeof data.bank_id !== 'string' || !safeId.test(data.bank_id) || typeof data.version !== 'string' || !safeId.test(data.version) || !Array.isArray(data.questions) || data.questions.length > 40) throw Error('شناسه، نسخه یا ساختار بانک معتبر نیست.');
  const ids = new Set<string>();
  const questions = data.questions.map((entry): BankQuestion => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw Error('ساختار سؤال معتبر نیست.');
    const q = entry as Record<string, unknown>;
    if (typeof q.id !== 'string' || !safeId.test(q.id) || ids.has(q.id) || !['math', 'text'].includes(String(q.mode)) || typeof q.source !== 'string' || !q.source.trim() || q.source.length > 4000 || (q.prompt !== undefined && (typeof q.prompt !== 'string' || q.prompt.length >= 4000)) || (q.guidance !== undefined && (typeof q.guidance !== 'string' || !q.guidance.trim() || q.guidance.length > 2000))) throw Error('متن، قالب یا شناسهٔ سؤال معتبر نیست.');
    const response = metadataSchema.parse({answerType: q.answerType, choices: q.choices});
    ids.add(q.id);
    if (q.mode === 'math') parse(ascii(q.source));
    return { ...(response.answerType ? {answerType: response.answerType} : {}), ...(response.choices ? {choices: response.choices} : {}), id: q.id, mode: q.mode as 'math' | 'text', source: q.source, ...(typeof q.prompt === 'string' ? { prompt: q.prompt } : {}), ...(typeof q.guidance === 'string' ? { guidance: q.guidance } : {}) };
  });
  return { schema_version: BANK_SCHEMA, bank_id: data.bank_id, version: data.version, questions };
}

/** Include a content digest in the version, even if the author forgot to bump it. */
export async function snapshotVersion(bank: DriveBank): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(bank));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const suffix = Array.from(new Uint8Array(hash)).slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join('');
  return `${bank.version.slice(0, 80)}-${suffix}`;
}
export function bankDocument(bank: DriveBank, version: string): Document {
  if (!bank.questions.length) throw Error('هنوز سؤالی در بانک موجود نیست.');
  const exercises: Exercise[] = bank.questions.map(q => ({ ...(q.answerType ? {answerType: q.answerType} : {}), ...(q.choices ? {choices: [...q.choices]} : {}), id: uid(), bankQuestionId: q.id, mode: q.mode, source: q.source, ...(q.prompt ? { prompt: q.prompt } : {}), ...(q.guidance ? { guidance: q.guidance } : {}), steps: [blankStep()] }));
  const first = exercises[0], step = first.steps[0];
  return { session: { ...newSessionMeta(), bankId: bank.bank_id, bankVersion: version }, exercises, exerciseId: first.id, cursor: { stepId: step.id, nodeId: leaves(step.expression)[0].node.id, sequenceId: null, index: 0, offset: 0, selected: null } };
}
export type ArchivedSession = { id: string; savedAt: string; data: string };
export function readArchive(): ArchivedSession[] {
  const raw = localStorage.getItem(ARCHIVE_KEY);
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.some(x => !x || typeof x.id !== 'string' || typeof x.savedAt !== 'string' || typeof x.data !== 'string')) throw Error('نسخه‌های ذخیره‌شده قابل خواندن نیستند؛ جلسهٔ فعلی حفظ شد.');
  return value as ArchivedSession[];
}
/** Never switch away until the current session is safely saved and read back. */
export function archiveSession(state: ScratchState): void {
  if (state.storageState) throw Error('ابتدا مشکل یا تداخل ذخیره‌سازی جلسهٔ فعلی را حل کن.');
  const id = state.doc.session?.id ?? uid(), data = serialize(state);
  validateSession(JSON.parse(data));
  const all = readArchive();
  const next = all.some(x => x.id === id && x.data === data) ? all : [...all, { id, savedAt: new Date().toISOString(), data }];
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(next));
  if (!readArchive().some(x => x.id === id && x.data === data)) throw Error('ذخیرهٔ جلسه تأیید نشد.');
}

/** Persian, user-facing message for a failed Drive call. */
export function driveError(status: number, action: string): Error {
  if (status === 401) return Error('مجوز Google منقضی شده؛ «اتصال دوباره» را بزن.');
  if (status === 403) return Error(`${action}: Google اجازه نداد (۴۰۳). فایل را دوباره از «انتخاب فایل بانک» انتخاب کن یا Drive API را در پروژهٔ Google Cloud فعال کن.`);
  if (status === 404) return Error(`${action}: فایل پیدا نشد یا به این برنامه داده نشده (۴۰۴). فایل را دوباره انتخاب کن.`);
  if (status === 429 || status >= 500) return Error(`${action}: Google موقتاً پاسخ نداد (${status})؛ بعداً خودکار دوباره امتحان می‌شود.`);
  return Error(`${action} ناموفق بود (${status}).`);
}
export const EMPTY_BANK = 'EMPTY_BANK';
/** Parse bank text; an empty file is a valid "no questions yet" state, not a crash. */
export function parseBankText(body: string): DriveBank | typeof EMPTY_BANK {
  if (body.length > 1000000) throw Error('فایل بانک بیش از حد بزرگ است.');
  if (!body.replace(/^\uFEFF/, '').trim()) return EMPTY_BANK;
  let json: unknown;
  try { json = JSON.parse(body.replace(/^\uFEFF/, '')); } catch { throw Error('محتوای فایل بانک JSON معتبر نیست؛ جلسهٔ فعلی تغییری نکرد.'); }
  return validateBank(json);
}
export type DriveMeta = { id: string; name: string; mimeType: string; size?: string; md5Checksum?: string; modifiedTime?: string; headRevisionId?: string; version?: string; trashed?: boolean };
const validFileId = (id: string) => /^[A-Za-z0-9_-]{10,150}$/.test(id);
/** Cheap metadata request used for change detection; content is downloaded only when this changes. */
export async function readDriveMeta(fileId: string, token: string): Promise<DriveMeta> {
  if (!validFileId(fileId)) throw Error('شناسهٔ فایل Drive معتبر نیست.');
  const fields = 'id,name,mimeType,size,md5Checksum,modifiedTime,headRevisionId,version,trashed';
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${fields}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) throw driveError(response.status, 'خواندن مشخصات فایل');
  const meta = await response.json() as DriveMeta;
  if (meta.trashed) throw Error('فایل بانک در سطل زبالهٔ Drive است.');
  if (meta.mimeType === 'application/vnd.google-apps.document') throw Error('فایل بانک Google Doc است؛ باید یک فایل ‎.json‎ معمولی باشد.');
  return meta;
}
/** Fingerprint of Drive metadata; any content edit changes md5Checksum/headRevisionId/version. */
export function metaFingerprint(meta: DriveMeta): string {
  return [meta.id, meta.md5Checksum ?? '', meta.headRevisionId ?? '', meta.version ?? '', meta.size ?? '', meta.modifiedTime ?? ''].join('|');
}
export async function readPrivateBankText(fileId: string, token: string): Promise<string> {
  if (!validFileId(fileId)) throw Error('شناسهٔ فایل Drive معتبر نیست.');
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) throw driveError(response.status, 'خواندن فایل بانک');
  return response.text();
}
export async function readPrivateBank(fileId: string, token: string): Promise<DriveBank | typeof EMPTY_BANK> {
  return parseBankText(await readPrivateBankText(fileId, token));
}
