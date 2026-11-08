import { getDeviceId, type LearnEvent } from './events';
import {
  clearVerifiedLegacyKeys,
  readLegacyMigration,
  readServerEventsByMigration,
  queueLearnEvent,
  withLegacyMigrationLock,
  writeLegacyMigration,
  type LegacyMigration,
} from './browser-db';

const CHUNK_BYTES = 6_000;
const utf8 = new TextEncoder();

function hex(bytes: Uint8Array): string { return [...bytes].map(value => value.toString(16).padStart(2, '0')).join(''); }

// Polyfill for Node.js environment
// Always check for crypto at runtime to support tests that set globalThis.crypto after module load
async function sha256(bytes: Uint8Array): Promise<string> {
  // Check at runtime if we have a working Web Crypto API
  if (typeof globalThis.crypto?.randomUUID === 'function' && typeof globalThis.crypto?.subtle?.digest === 'function') {
    try {
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)));
    } catch {
      // Fallback to Node.js crypto if Web Crypto fails
    }
  }

  // Node.js environment or test environment - use Node.js crypto
  try {
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256');
    hash.update(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    return hex(new Uint8Array(hash.digest()));
  } catch {
    throw new Error('Browser cryptography is unavailable; migration was left unchanged.');
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x4000) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + 0x4000)));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value), bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function joinBytes(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function migrationEvents(migration: LegacyMigration): LearnEvent[] {
  const deviceId = getDeviceId();
  let eventIdIndex = 0;
  return migration.entries.flatMap(entry => {
    const bytes = utf8.encode(entry.value);
    const count = Math.max(1, Math.ceil(bytes.length / CHUNK_BYTES));
    return Array.from({ length: count }, (_, index) => {
      const part = bytes.subarray(index * CHUNK_BYTES, Math.min((index + 1) * CHUNK_BYTES, bytes.length));
      const eventId = migration.eventIds[eventIdIndex++];
      if (!eventId) throw new Error('The migration event manifest is incomplete.');
      return {
        id: eventId,
        schema: 1 as const,
        ts: migration.createdAt,
        deviceId,
        bankVersion: 'migration-v1',
        session: `migration-${migration.id}`,
        chapter: 0,
        lesson: 'unknown',
        section: 'unknown',
        concept: 'legacy-storage',
        type: 'legacy_state_migration' as const,
        itemId: entry.key,
        migrationChunk: {
          id: migration.id,
          key: entry.key,
          index,
          count,
          sha256: entry.sha256,
          data: toBase64(part),
        },
      };
    });
  });
}

/** Materialize the durable migration manifest before queueing events, so retries keep stable IDs. */
export async function queueLegacyMigration(): Promise<LegacyMigration | null> {
  return withLegacyMigrationLock(async () => {
  const existing = await readLegacyMigration();
  if (!existing || existing.status !== 'pending' || !existing.entries.length) return existing;
  const entries = await Promise.all(existing.entries.map(async entry => ({
    ...entry,
    sha256: entry.sha256 || await sha256(utf8.encode(entry.value)),
  })));
  const chunksNeeded = entries.reduce((total, entry) => total + Math.max(1, Math.ceil(utf8.encode(entry.value).length / CHUNK_BYTES)), 0);
  let migration: LegacyMigration = { ...existing, entries };
  if (migration.eventIds.length === 0) {
    migration = { ...migration, eventIds: Array.from({ length: chunksNeeded }, () => crypto.randomUUID()) };
    await writeLegacyMigration(migration);
  } else if (migration.eventIds.length !== chunksNeeded) {
    throw new Error('The saved migration manifest does not match its data; legacy values remain untouched.');
  }
  const events = migrationEvents(migration);
  for (const event of events) await queueLearnEvent(event, migration.id);
    return migration;
  });
}

/** Confirm every submitted byte by reading the acknowledged events back from the server cache. */
export async function verifyLegacyMigrationOnServer(): Promise<LegacyMigration> {
  return withLegacyMigrationLock(async () => {
  const migration = await readLegacyMigration();
  if (!migration || !migration.entries.length) throw new Error('There is no legacy learning data to migrate.');
  if (migration.status === 'complete' || migration.status === 'drive-backed-up' || migration.status === 'server-verified') return migration;
  const records = await readServerEventsByMigration(migration.id);
  const expectedIds = new Set(migration.eventIds);
  const received = records.filter(record => record.event.migrationChunk?.id === migration.id && expectedIds.has(record.event.id));
  if (received.length !== migration.eventIds.length || new Set(received.map(record => record.event.id)).size !== migration.eventIds.length) {
    throw new Error('The server has not confirmed every migration chunk yet. Legacy data remains in the browser.');
  }
  for (const entry of migration.entries) {
    const parts = received
      .map(record => record.event.migrationChunk!)
      .filter(chunk => chunk.key === entry.key)
      .sort((left, right) => left.index - right.index);
    if (!parts.length || parts.length !== parts[0].count || parts.some((chunk, index) => chunk.index !== index || chunk.count !== parts.length || chunk.sha256 !== entry.sha256)) {
      throw new Error(`The server copy for ${entry.key} is incomplete; legacy data remains in the browser.`);
    }
    const rebuilt = new TextDecoder('utf-8', { fatal: true }).decode(joinBytes(parts.map(part => fromBase64(part.data))));
    if (rebuilt !== entry.value || await sha256(utf8.encode(rebuilt)) !== entry.sha256) {
      throw new Error(`The server copy for ${entry.key} failed its SHA-256 check; legacy data remains in the browser.`);
    }
  }
  const verified: LegacyMigration = { ...migration, status: 'server-verified', serverVerifiedAt: new Date().toISOString() };
  await writeLegacyMigration(verified);
    return verified;
  });
}

export function legacyMigrationBackupContents(migration: LegacyMigration): string {
  if (migration.status !== 'server-verified' && migration.status !== 'drive-backed-up' && migration.status !== 'complete') {
    throw new Error('Verify the server copy before creating the Drive backup.');
  }
  return JSON.stringify({
    format: 'math-scratchpad-learning-backup/v1',
    migrationId: migration.id,
    createdAt: migration.createdAt,
    serverVerifiedAt: migration.serverVerifiedAt,
    entries: migration.entries,
  }, null, 2);
}

export type LegacyMigrationDriveFile = { id: string; name: string };
export type LegacyMigrationBackupResult = {
  migration: LegacyMigration;
  file: LegacyMigrationDriveFile;
  cleared: string[];
  reused: boolean;
};

async function markLegacyMigrationDriveVerifiedUnlocked(
  migration: LegacyMigration,
  file: LegacyMigrationDriveFile,
): Promise<LegacyMigration> {
  const current = await readLegacyMigration();
  if (!current || current.id !== migration.id) {
    throw new Error('The legacy migration changed in another tab; reload before creating a backup.');
  }
  if (current.status === 'drive-backed-up' || current.status === 'complete') {
    if (current.backupFileId === file.id && current.backupFileName === file.name) return current;
    throw new Error('Another tab already recorded a different Drive backup; legacy browser data was not cleared.');
  }
  if (current.status !== 'server-verified') {
    throw new Error('The server copy must still be verified before recording the Drive backup.');
  }
  if (JSON.stringify(current.entries) !== JSON.stringify(migration.entries)
      || JSON.stringify(current.eventIds) !== JSON.stringify(migration.eventIds)) {
    throw new Error('The migration snapshot changed before the Drive backup was recorded; legacy browser data was not cleared.');
  }
  const updated: LegacyMigration = {
    ...current,
    status: 'drive-backed-up',
    backupFileId: file.id,
    backupFileName: file.name,
    backupVerifiedAt: new Date().toISOString(),
  };
  await writeLegacyMigration(updated);
  return updated;
}

async function finishLegacyMigrationUnlocked(): Promise<{ migration: LegacyMigration; cleared: string[] }> {
  const migration = await readLegacyMigration();
  if (!migration) throw new Error('There is no legacy migration to finish.');
  if (migration.status === 'complete') return { migration, cleared: [] };
  if (migration.status !== 'drive-backed-up' || !migration.backupVerifiedAt || !migration.backupFileId || !migration.backupFileName) {
    throw new Error('Both the server upload and the Drive backup must be verified before clearing old browser keys.');
  }
  const result = await clearVerifiedLegacyKeys(migration);
  if (result.changed.length) {
    throw new Error(`Legacy data changed during migration (${result.changed.join(', ')}); none of those keys were removed.`);
  }
  const complete: LegacyMigration = { ...migration, status: 'complete' };
  await writeLegacyMigration(complete);
  return { migration: complete, cleared: result.cleared };
}

export async function markLegacyMigrationDriveVerified(
  migration: LegacyMigration,
  file: LegacyMigrationDriveFile,
): Promise<LegacyMigration> {
  return withLegacyMigrationLock(() => markLegacyMigrationDriveVerifiedUnlocked(migration, file));
}

export async function finishLegacyMigration(): Promise<{ migration: LegacyMigration; cleared: string[] }> {
  return withLegacyMigrationLock(() => finishLegacyMigrationUnlocked());
}

/** Re-read the current migration and hold the cross-tab lock through Drive read-back and cleanup. */
export async function backupAndFinishLegacyMigration(
  migrationId: string,
  createBackup: (migration: LegacyMigration, contents: string) => Promise<LegacyMigrationDriveFile>,
): Promise<LegacyMigrationBackupResult> {
  return withLegacyMigrationLock(async () => {
    const current = await readLegacyMigration();
    if (!current || current.id !== migrationId) {
      throw new Error('The migration changed in another tab; reload its current status before creating a backup.');
    }
    if (current.status === 'complete' || current.status === 'drive-backed-up') {
      if (!current.backupFileId || !current.backupFileName || !current.backupVerifiedAt) {
        throw new Error('The saved Drive backup metadata is incomplete; no second backup was created.');
      }
      const result = current.status === 'complete'
        ? { migration: current, cleared: [] as string[] }
        : await finishLegacyMigrationUnlocked();
      return {
        migration: result.migration,
        file: { id: current.backupFileId, name: current.backupFileName },
        cleared: result.cleared,
        reused: true,
      };
    }
    if (current.status !== 'server-verified') {
      throw new Error('Verify the server copy before creating the Drive backup.');
    }
    const contents = legacyMigrationBackupContents(current);
    const file = await createBackup(current, contents);
    await markLegacyMigrationDriveVerifiedUnlocked(current, file);
    const result = await finishLegacyMigrationUnlocked();
    return { migration: result.migration, file, cleared: result.cleared, reused: false };
  });
}
