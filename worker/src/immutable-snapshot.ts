/** A content-addressed Drive snapshot is never updated in place. */
export type SnapshotStore = {
  find(name: string): Promise<string[]>;
  create(name: string, content: string): Promise<string>;
  read(id: string): Promise<string>;
};

export class SnapshotError extends Error {
  constructor(readonly code: 'duplicate_snapshot' | 'snapshot_mismatch') {
    super(code);
  }
}

export async function snapshotName(logicalName: string, content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  return `${logicalName}.sha256-${hash}`;
}

/** Reuses a verified snapshot; conflicting names or contents fail closed. */
export async function writeImmutableSnapshot(store: SnapshotStore, logicalName: string, content: string): Promise<{ id: string; name: string }> {
  const name = await snapshotName(logicalName, content);
  const matches = await store.find(name);
  if (matches.length > 1) throw new SnapshotError('duplicate_snapshot');
  const id = matches[0] ?? await store.create(name, content);
  const confirmed = await store.find(name);
  if (confirmed.length !== 1 || confirmed[0] !== id) throw new SnapshotError('duplicate_snapshot');
  if (await store.read(id) !== content) throw new SnapshotError('snapshot_mismatch');
  return { id, name };
}
