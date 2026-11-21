import { HistoryChunk, HistoryChunkSchema, HistoryRecord } from '../../domain/entities/history-chunk.types';
import { MathScratchpadDB } from '../scratchpad-db';

export class HistoryRepository {
  constructor(private db: MathScratchpadDB) {}

  async getHistoryChunks(chapterId: string): Promise<HistoryChunk[]> {
    return this.db.history_chunks.where('chapterId').equals(chapterId).toArray();
  }

  async appendHistoryRecord(
    chapterId: string,
    record: HistoryRecord,
    deviceId: string
  ): Promise<void> {
    const chunkId = `hist-${chapterId}-${deviceId}`;
    await this.db.transaction('rw', this.db.history_chunks, async () => {
      let chunk = await this.db.history_chunks.get(chunkId);
      if (!chunk) {
        chunk = {
          schemaVersion: '1.0.0',
          kind: 'history_chunk',
          chunkId,
          chapterId,
          deviceId,
          records: []
        };
      }
      chunk.records.push(record);
      HistoryChunkSchema.parse(chunk);
      await this.db.history_chunks.put(chunk);
    });
  }
}
