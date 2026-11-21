import { ChapterBundle, ChapterBundleSchema } from '../domain/entities/chapter-bundle.types';
import { ChapterProgress } from '../domain/entities/chapter-progress.types';
import { HistoryChunk, HistoryRecord } from '../domain/entities/history-chunk.types';
import { mergeChapterProgress } from '../domain/sync/lww-merge';
import { db } from './scratchpad-db';

export const LAST_EXPORT_KEY = 'last_exported_at';

export interface ImportResult {
  status: 'success';
  chapterId: string;
  mergedProgress: ChapterProgress;
  historyRecordCount: number;
}

export class ChapterBundleService {
  /**
   * Serializes a complete chapter bundle adhering strictly to Draft 2020-12 chapter-bundle.schema.json.
   */
  static async exportChapterBundle(
    chapterId: string,
    options: { includeTimers?: boolean } = {}
  ): Promise<{ filename: string; jsonString: string; bundle: ChapterBundle }> {
    const bank = await db.chapters_bank.get(chapterId);
    if (!bank) {
      throw new Error(`Cannot export: Bank chapter "${chapterId}" not found in local database.`);
    }

    let progress = await db.progress_docs.get(chapterId);
    if (!progress) {
      // Create empty progress doc if none exists yet
      progress = {
        schemaVersion: '1.0.0',
        kind: 'chapter_progress',
        chapterId,
        bankVersion: bank.bankVersion,
        updatedHlc: '0000000000000:0000:export-init',
        items: {}
      };
    }

    const historyChunks = await db.history_chunks.where('chapterId').equals(chapterId).toArray();

    let timers = undefined;
    if (options.includeTimers) {
      timers = await db.timer_logs.toCollection().first();
    }

    const nowIso = new Date().toISOString();
    const bundle: ChapterBundle = {
      schemaVersion: '1.0.0',
      kind: 'chapter_bundle',
      exportedAtIso: nowIso,
      bank,
      progress,
      historyChunks,
      timers
    };

    const validated = ChapterBundleSchema.parse(bundle);
    const jsonString = JSON.stringify(validated, null, 2);

    // Record last export time in app_meta to track storage eviction risks
    await db.app_meta.put({
      key: LAST_EXPORT_KEY,
      value: nowIso,
      updatedAtIso: nowIso
    });

    const safeTimestamp = nowIso.replace(/[:.]/g, '-');
    const filename = `${chapterId}-bundle-${safeTimestamp}.json`;

    return { filename, jsonString, bundle: validated };
  }

  /**
   * Imports a chapter bundle using non-destructive HLC Last-Write-Wins merge.
   * Older imported progress will never overwrite newer local steps.
   * History chunks are unioned by recordId.
   */
  static async importChapterBundle(raw: string | object): Promise<ImportResult> {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const bundle = ChapterBundleSchema.parse(parsed);

    const chapterId = bundle.chapterId || bundle.bank.chapterId;

    return await db.transaction(
      'rw',
      [db.chapters_bank, db.progress_docs, db.history_chunks, db.timer_logs],
      async () => {
        // 1. Save Bank
        await db.chapters_bank.put(bundle.bank);

        // 2. Merge Progress with existing local progress using HLC LWW
        const existingProgress = await db.progress_docs.get(chapterId);
        let finalProgress: ChapterProgress;

        if (existingProgress) {
          finalProgress = mergeChapterProgress(existingProgress, bundle.progress);
        } else {
          finalProgress = bundle.progress;
        }
        await db.progress_docs.put(finalProgress);

        // 3. Union History Chunks by recordId
        let totalHistoryRecords = 0;
        for (const importedChunk of bundle.historyChunks) {
          const localChunk = await db.history_chunks.get(importedChunk.chunkId);
          if (!localChunk) {
            await db.history_chunks.put(importedChunk);
            totalHistoryRecords += importedChunk.records.length;
          } else {
            // Union records by recordId
            const existingIds = new Set(localChunk.records.map(r => r.recordId));
            const mergedRecords = [...localChunk.records];
            for (const rec of importedChunk.records) {
              if (!existingIds.has(rec.recordId)) {
                mergedRecords.push(rec);
                existingIds.add(rec.recordId);
              }
            }
            localChunk.records = mergedRecords;
            await db.history_chunks.put(localChunk);
            totalHistoryRecords += mergedRecords.length;
          }
        }

        // 4. Save timers if included
        if (bundle.timers) {
          await db.timer_logs.put(bundle.timers);
        }

        return {
          status: 'success',
          chapterId,
          mergedProgress: finalProgress,
          historyRecordCount: totalHistoryRecords
        };
      }
    );
  }
}
