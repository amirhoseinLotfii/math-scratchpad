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

export async function snapshotHash(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function snapshotName(logicalName: string, content: string): Promise<string> {
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(logicalName)) throw new Error('invalid_snapshot_name');
  const hash = await snapshotHash(content);
  const extension = logicalName.match(/\.[A-Za-z0-9]{1,12}$/)?.[0] ?? '';
  const stem = extension ? logicalName.slice(0, -extension.length) : logicalName;
  return `${stem}.sha256-${hash}${extension}`;
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
