import { describe, expect, it } from 'vitest';
import { SnapshotError, snapshotName, writeImmutableSnapshot, type SnapshotStore } from '../src/immutable-snapshot';

function memoryStore() {
  const files = new Map<string, { name: string; content: string }>();
  let count = 0;
  const store: SnapshotStore = {
    find: async name => [...files].filter(([, f]) => f.name === name).map(([id]) => id),
    create: async (name, content) => { const id = String(++count); files.set(id, { name, content }); return id; },
    read: async id => files.get(id)?.content ?? '',
  };
  return { files, store };
}

describe('immutable Drive snapshots', () => {
  it('reuses the same verified bytes without creating duplicates', async () => {
    const { store, files } = memoryStore();
    const a = await writeImmutableSnapshot(store, 'events.jsonl', 'alpha\n');
    const b = await writeImmutableSnapshot(store, 'events.jsonl', 'alpha\n');
    expect(b).toEqual(a);
    expect(files.size).toBe(1);
  });
  it('preserves the old snapshot when content changes', async () => {
    const { store, files } = memoryStore();
    const a = await writeImmutableSnapshot(store, 'events.jsonl', 'alpha\n');
    const b = await writeImmutableSnapshot(store, 'events.jsonl', 'beta\n');
    expect(a.id).not.toBe(b.id);
    expect(files.get(a.id)?.content).toBe('alpha\n');
    expect(files.get(b.id)?.content).toBe('beta\n');
  });
  it('fails closed if an existing named snapshot was changed externally', async () => {
    const { store, files } = memoryStore();
    const name = await snapshotName('state.json', 'expected');
    files.set('external', { name, content: 'different' });
    await expect(writeImmutableSnapshot(store, 'state.json', 'expected')).rejects.toMatchObject({ code: 'snapshot_mismatch' });
    expect(files.size).toBe(1);
  });
  it('rejects duplicate names instead of selecting one arbitrarily', async () => {
    const { store, files } = memoryStore();
    const name = await snapshotName('state.json', 'expected');
    files.set('1', { name, content: 'expected' }); files.set('2', { name, content: 'expected' });
    await expect(writeImmutableSnapshot(store, 'state.json', 'expected')).rejects.toBeInstanceOf(SnapshotError);
    expect(files.size).toBe(2);
  });
  it('fails if the provider read-back differs after creation', async () => {
    let created = false;
    const store: SnapshotStore = { find: async () => created ? ['id'] : [], create: async () => { created = true; return 'id'; }, read: async () => 'different' };
    await expect(writeImmutableSnapshot(store, 'state.json', 'expected')).rejects.toMatchObject({ code: 'snapshot_mismatch' });
  });
  it('refuses the checkpoint if a concurrent writer creates a duplicate', async () => {
    let reads = 0;
    const store: SnapshotStore = { find: async () => ++reads === 1 ? [] : ['ours', 'other'], create: async () => 'ours', read: async () => 'expected' };
    await expect(writeImmutableSnapshot(store, 'state.json', 'expected')).rejects.toMatchObject({ code: 'duplicate_snapshot' });
  });
});
