import type { ArchivedSession, BankQuestion, CachedBank, DriveBank } from '../../../domain/entities/drive-bank.types';
import { flushLearningStorage, getLearningStorage } from '../../../sync/browser-db';
import { blankStep, leaves, MAX_SESSION_EXERCISES, uid, type Document, type Exercise } from '../../math-editor/model/model';
import { newSessionMeta, type ScratchState } from '../../math-editor/store/editor-store';
import { serialize, validateSession } from '../../session/persistence/session-validator';
import { snapshotVersion, validateBank } from './bank-validator';

export const ARCHIVE_KEY = 'math-scratchpad-drive-session-archive-v1';
export const BANK_CACHE_PREFIX = 'math-scratchpad-drive-bank-cache-v1';
const BANK_CACHE_SCHEMA = 1;
const MAX_BANK_CACHE_LENGTH = 2_000_000;

export function bankCacheStorageKey(fileId: string): string {
  return `${BANK_CACHE_PREFIX}:${encodeURIComponent(fileId)}`;
}

export async function readBankCache(fileId: string, storage?: Storage): Promise<CachedBank | null> {
  const target = storage ?? getLearningStorage();
  const raw = target.getItem(bankCacheStorageKey(fileId));
  if (!raw || raw.length > MAX_BANK_CACHE_LENGTH) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== BANK_CACHE_SCHEMA || record.fileId !== fileId || typeof record.version !== 'string' || typeof record.fingerprint !== 'string' || typeof record.savedAt !== 'string') return null;
  const bank = validateBank(record.bank);
  if (await snapshotVersion(bank) !== record.version) return null;
  return { fileId, bank, version: record.version, fingerprint: record.fingerprint, savedAt: record.savedAt };
}

export async function saveBankCache(fileId: string, bank: DriveBank, version: string, fingerprint: string, storage?: Storage): Promise<{ saved: boolean; message: string }> {
  const target = storage ?? getLearningStorage();
  try {
    const cleanBank = validateBank(bank);
    if (await snapshotVersion(cleanBank) !== version) return { saved: false, message: 'The bank cache version did not match the downloaded content.' };
    const payload = JSON.stringify({ schemaVersion: BANK_CACHE_SCHEMA, fileId, bank: cleanBank, version, fingerprint, savedAt: new Date().toISOString() });
    if (payload.length > MAX_BANK_CACHE_LENGTH) return { saved: false, message: 'The bank is too large to cache in this browser.' };
    const key = bankCacheStorageKey(fileId);
    target.setItem(key, payload);
    await flushLearningStorage();
    const verified = await readBankCache(fileId, target);
    if (!verified || verified.version !== version || verified.fingerprint !== fingerprint) throw Error('Local cache read-back did not match.');
    return { saved: true, message: '' };
  } catch {
    return { saved: false, message: 'The bank loaded, but this browser could not save a verified offline copy.' };
  }
}

export function bankDocument(bank: DriveBank, version: string, includedQuestions: BankQuestion[] = bank.questions.filter(question => question.stage !== 'learn')): Document {
  if (!includedQuestions.length) throw Error('No practice questions are available in this bank yet.');
  if (includedQuestions.length > MAX_SESSION_EXERCISES) throw Error(`A practice session can include at most ${MAX_SESSION_EXERCISES} questions. Continue with the next batch after finishing this one.`);
  const exercises: Exercise[] = includedQuestions.map(q => ({ id: uid(), bankQuestionId: q.id, mode: q.mode, source: q.source, answerType: q.answerType ?? (q.mode === 'text' ? 'text' : 'math'), ...(q.answerType === 'choice' && q.choices ? { choices: [...q.choices] } : {}), ...(q.prompt ? { prompt: q.prompt } : {}), ...(q.guidance ? { guidance: q.guidance } : {}), stage: q.stage ?? 'practice', ...(q.conceptId ? { conceptId: q.conceptId } : {}), steps: [blankStep()] }));
  const first = exercises[0], step = first.steps[0];
  return { session: { ...newSessionMeta(), bankId: bank.bank_id, bankVersion: version, ...(bank.chapter ? { chapter: bank.chapter.number } : {}) }, exercises, exerciseId: first.id, cursor: { stepId: step.id, nodeId: leaves(step.expression)[0].node.id, sequenceId: null, index: 0, offset: 0, selected: null } };
}

export function readArchive(): ArchivedSession[] {
  const raw = getLearningStorage().getItem(ARCHIVE_KEY);
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.some(x => !x || typeof x.id !== 'string' || typeof x.savedAt !== 'string' || typeof x.data !== 'string')) throw Error('Saved sessions could not be read. The current session was preserved.');
  return value as ArchivedSession[];
}

/** Never switch away until the current session is safely saved and read back. */
export async function archiveSession(state: ScratchState): Promise<void> {
  if (state.storageState) throw Error('Resolve the current session storage warning or conflict first.');
  const id = state.doc.session?.id ?? uid(), data = serialize(state);
  validateSession(JSON.parse(data));
  const all = readArchive();
  const next = all.some(x => x.id === id && x.data === data) ? all : [...all, { id, savedAt: new Date().toISOString(), data }];
  getLearningStorage().setItem(ARCHIVE_KEY, JSON.stringify(next));
  await flushLearningStorage();
  if (!readArchive().some(x => x.id === id && x.data === data)) throw Error('The saved session could not be verified.');
}
