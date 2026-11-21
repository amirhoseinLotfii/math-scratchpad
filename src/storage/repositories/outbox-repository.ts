import { MathScratchpadDB, OutboxEntry } from '../scratchpad-db';

export class OutboxRepository {
  constructor(private db: MathScratchpadDB) {}

  async queueOutbox(
    outboxKey: string,
    dirtySinceHlc: string,
    priority: 'immediate' | 'debounce' = 'debounce'
  ): Promise<void> {
    const nowIso = new Date().toISOString();
    const existing = await this.db.sync_outbox.where('outboxKey').equals(outboxKey).first();

    if (existing && existing.id) {
      await this.db.sync_outbox.update(existing.id, {
        dirtySinceHlc,
        priority: priority === 'immediate' ? 'immediate' : existing.priority,
        status: 'pending',
        updatedAtIso: nowIso
      });
    } else {
      await this.db.sync_outbox.put({
        outboxKey,
        status: 'pending',
        dirtySinceHlc,
        priority,
        retryCount: 0,
        createdAtIso: nowIso,
        updatedAtIso: nowIso
      });
    }
  }

  async getPendingOutbox(): Promise<OutboxEntry[]> {
    return this.db.sync_outbox.where('status').equals('pending').toArray();
  }

  async claimOutbox(id: number): Promise<boolean> {
    return await this.db.transaction('rw', this.db.sync_outbox, async () => {
      const item = await this.db.sync_outbox.get(id);
      if (!item || item.status === 'in_flight') return false;
      await this.db.sync_outbox.update(id, {
        status: 'in_flight',
        updatedAtIso: new Date().toISOString()
      });
      return true;
    });
  }

  /**
   * Ack rule (§4.3): delete outbox row ONLY if dirtySinceHlc <= uploadedHlc.
   * If newer keystrokes arrived mid-flight, keep row as pending.
   */
  async ackOutbox(id: number, uploadedHlc: string): Promise<boolean> {
    return await this.db.transaction('rw', this.db.sync_outbox, async () => {
      const item = await this.db.sync_outbox.get(id);
      if (!item) return true;

      if (item.dirtySinceHlc <= uploadedHlc) {
        await this.db.sync_outbox.delete(id);
        return true;
      } else {
        // Newer edits arrived during upload
        await this.db.sync_outbox.update(id, {
          status: 'pending',
          updatedAtIso: new Date().toISOString()
        });
        return false;
      }
    });
  }
}
