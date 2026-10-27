import { ascii, blankStep, leaves, uid, type Document, type Exercise } from '../../model';
import { newSessionMeta, type ScratchState } from '../../store';
import { parse } from '../../parser';
import { serialize, validateSession } from '../../persistence';

export const BANK_SCHEMA = 'math-scratchpad.bank/1.0';
export const ARCHIVE_KEY = 'math-scratchpad-drive-session-archive-v1';
export type BankQuestion = { id: string; mode: 'math' | 'text'; source: string; prompt?: string };
export type DriveBank = { schema_version: string; bank_id: string; version: string; questions: BankQuestion[] };
const safeId = /^[\w.-]{1,80}$/;
export function validateBank(input: unknown): DriveBank {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('ساختار بانک معتبر نیست.');
  const data = input as Record<string, unknown>;
  if (data.schema_version !== BANK_SCHEMA || typeof data.bank_id !== 'string' || !safeId.test(data.bank_id) || typeof data.version !== 'string' || !safeId.test(data.version) || !Array.isArray(data.questions) || data.questions.length > 40) throw Error('شناسه، نسخه یا ساختار بانک معتبر نیست.');
  const ids = new Set<string>();
  const questions = data.questions.map((entry): BankQuestion => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw Error('ساختار سؤال معتبر نیست.');
    const q = entry as Record<string, unknown>;
    if (Object.keys(q).some(k => /^(answer|answers|expected|solution|key|rubric|verification)$/i.test(k))) throw Error('بانک سؤال نباید پاسخ یا کلید داشته باشد.');
    if (typeof q.id !== 'string' || !safeId.test(q.id) || ids.has(q.id) || !['math', 'text'].includes(String(q.mode)) || typeof q.source !== 'string' || !q.source.trim() || q.source.length > 4000 || (q.prompt !== undefined && (typeof q.prompt !== 'string' || q.prompt.length >= 4000))) throw Error('متن، قالب یا شناسهٔ سؤال معتبر نیست.');
    ids.add(q.id);
    if (q.mode === 'math') parse(ascii(q.source));
    return { id: q.id, mode: q.mode as 'math' | 'text', source: q.source, ...(typeof q.prompt === 'string' ? { prompt: q.prompt } : {}) };
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
  const exercises: Exercise[] = bank.questions.map(q => ({ id: uid(), bankQuestionId: q.id, mode: q.mode, source: q.source, ...(q.prompt ? { prompt: q.prompt } : {}), steps: [blankStep()] }));
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

export async function readPrivateBank(fileId: string, token: string): Promise<DriveBank> {
  if (!/^[A-Za-z0-9_-]{10,150}$/.test(fileId)) throw Error('شناسهٔ فایل Drive معتبر نیست.');
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) throw Error(response.status === 401 ? 'مجوز Google منقضی شده؛ دوباره متصل شو.' : `خواندن فایل Drive ناموفق بود (${response.status}).`);
  const body = await response.text();
  if (body.length > 1000000) throw Error('فایل بانک بیش از حد بزرگ است.');
  return validateBank(JSON.parse(body));
}

/** Find the one configured bank without publishing its private Drive file ID. */
export async function findQuestionBank(token: string): Promise<string> {
  const params = new URLSearchParams({ q: "name = 'MATH_QUESTION_BANK.json' and trashed = false", fields: 'nextPageToken,files(id,name,mimeType)', pageSize: '100', spaces: 'drive' });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) throw Error(response.status === 401 ? 'مجوز Google منقضی شده؛ دوباره متصل شو.' : `جست‌وجوی بانک ناموفق بود (${response.status}).`);
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || !('files' in data) || !Array.isArray(data.files)) throw Error('فهرست فایل‌های Drive معتبر نیست.');
  if (('nextPageToken' in data && data.nextPageToken) || data.files.length !== 1 || typeof data.files[0]?.id !== 'string') throw Error('باید دقیقاً یک فایل MATH_QUESTION_BANK.json در Drive وجود داشته باشد.');
  return data.files[0].id;
}
