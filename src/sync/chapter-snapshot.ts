import type { LearnEventContext } from './events';
import { emitLearnEvent } from './events';
import { flushLearningStorage, queueLearnEvent } from './browser-db';

// Zod string length counts UTF-16 code units; 3,800 Unicode points stay below
// the 8,000-unit event limit even if every character needs a surrogate pair.
const SNAPSHOT_CHUNK_SIZE = 3_800;

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function uuidFromHash(hash: string): string {
  const chars = hash.slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = ((Number.parseInt(chars[16]!, 16) & 0x3) | 0x8).toString(16);
  const value = chars.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function splitCodePoints(value: string): string[] {
  const chars = Array.from(value);
  if (!chars.length) return ['{}'];
  const chunks: string[] = [];
  for (let index = 0; index < chars.length; index += SNAPSHOT_CHUNK_SIZE) {
    chunks.push(chars.slice(index, index + SNAPSHOT_CHUNK_SIZE).join(''));
  }
  return chunks;
}

/** Queue an immutable, checksummed snapshot before chapter data is cleared locally. */
export async function queueChapterSnapshot(input: {
  bankId: string;
  bankVersion: string;
  chapter: number;
  sessionId: string;
  payload: unknown;
}): Promise<{ snapshotId: string; sha256: string; parts: number }> {
  const serialized = JSON.stringify(input.payload);
  const sha256 = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized)));
  const snapshotId = uuidFromHash(sha256);
  const chunks = splitCodePoints(serialized);
  const context: LearnEventContext = {
    bankVersion: input.bankVersion.slice(0, 50) || 'unknown',
    session: input.sessionId.slice(0, 100) || `chapter-${input.chapter}`,
    chapter: input.chapter,
    lesson: 'chapter-snapshot',
    section: 'archive',
    concept: 'chapter-archive',
  };

  for (let part = 0; part < chunks.length; part += 1) {
    const event = emitLearnEvent(context, {
      type: 'chapter_snapshot',
      snapshotId,
      snapshotBankId: input.bankId,
      snapshotPart: part,
      snapshotParts: chunks.length,
      snapshotSha256: sha256,
      snapshotData: chunks[part]!,
      isTest: false,
    });
    // The runtime also subscribes to these events; the explicit write makes
    // the chapter barrier wait until every chunk is durable in the local outbox.
    await queueLearnEvent(event);
  }
  await flushLearningStorage();
  return { snapshotId, sha256, parts: chunks.length };
}
