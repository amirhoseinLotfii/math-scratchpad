import Dexie, { type Table } from 'dexie';
import { BankChapter } from '../domain/entities/bank-chapter.types';
import { ChapterProgress } from '../domain/entities/chapter-progress.types';
import { HistoryChunk } from '../domain/entities/history-chunk.types';
import { TimerLog } from '../domain/entities/timer-log.types';

export interface OutboxEntry {
  id?: number;
  outboxKey: string;
  status: 'pending' | 'in_flight' | 'failed';
  dirtySinceHlc: string;
  priority: 'immediate' | 'debounce';
  retryCount: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface AppMetaEntry {
  key: string;
  value: unknown;
  updatedAtIso: string;
}

export class MathScratchpadDB extends Dexie {
  chapters_bank!: Table<BankChapter, string>;
  progress_docs!: Table<ChapterProgress, string>;
  history_chunks!: Table<HistoryChunk, string>;
  timer_logs!: Table<TimerLog, string>;
  sync_outbox!: Table<OutboxEntry, number>;
  app_meta!: Table<AppMetaEntry, string>;

  constructor(dbName: string = 'math-scratchpad-dexie-v1') {
    super(dbName);

    this.version(1).stores({
      chapters_bank: '&chapterId, bankVersion, [chapterId+bankVersion]',
      progress_docs: '&chapterId, bankVersion, updatedHlc, [chapterId+bankVersion]',
      history_chunks: '&chunkId, chapterId, deviceId, [chapterId+deviceId]',
      timer_logs: '&updatedHlc',
      sync_outbox: '++id, &outboxKey, status, dirtySinceHlc, priority',
      app_meta: '&key'
    });
  }
}

export const db = new MathScratchpadDB();
