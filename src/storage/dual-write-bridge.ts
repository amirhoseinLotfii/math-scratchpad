import { migrateDocument } from '../domain/sync/migrate-document';
import { db } from './scratchpad-db';
import { BankRepository } from './repositories/bank-repository';
import { ProgressRepository } from './repositories/progress-repository';

const bankRepo = new BankRepository(db);
const progressRepo = new ProgressRepository(db);

/**
 * Dual-write bridge: intercepts local saves from legacy storage and mirrors
 * them into canonical Dexie tables (chapters_bank, progress_docs) via migrateDocument.
 */
export async function dualWriteToDexie(key: string, value: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(value);
    const result = migrateDocument(parsed);

    if (result.kind === 'bank_chapter' && result.document) {
      await bankRepo.saveBankChapter(result.document as any);
      return true;
    }

    if (result.kind === 'chapter_progress') {
      if (result.multipleProgress && result.multipleProgress.length > 0) {
        for (const prog of result.multipleProgress) {
          await progressRepo.saveChapterProgress(prog);
        }
      } else if (result.document) {
        await progressRepo.saveChapterProgress(result.document as any);
      }
      return true;
    }

    return false;
  } catch (err) {
    console.warn('[DualWriteBridge] Failed to mirror to Dexie:', err);
    return false;
  }
}
