import { mergeServerStateValues } from '../server-conflict-merge';
import type { ServerStateRecord } from './state-api';

export function mergeStateSnapshot(
  snapshot: { records: ServerStateRecord[] },
  key: string,
  baseValue: string | null,
  localValue: string | null,
) {
  const remote = snapshot.records.find((record) => record.key === key);
  const remoteValue = remote?.value ?? null;
  const remoteRevision = remote?.revision ?? 0;
  return { remoteValue, remoteRevision, merge: mergeServerStateValues(key, baseValue, localValue, remoteValue) };
}
