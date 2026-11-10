type JsonObject = { [key: string]: JsonValue };
type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
type MergeValue = JsonValue | typeof MISSING;
type MergeResult = { ok: true; value: MergeValue } | { ok: false; paths: string[] };

const MISSING = Symbol('missing-json-value');
const SESSION_KEY = 'math-scratchpad-session-v3';

function isObject(value: MergeValue): value is JsonObject {
  return value !== MISSING && value !== null && typeof value === 'object' && !Array.isArray(value);
}

function equal(left: MergeValue, right: MergeValue): boolean {
  if (left === right) return true;
  if (left === MISSING || right === MISSING || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => equal(value, right[index] as JsonValue));
  }
  if (typeof left !== 'object' || typeof right !== 'object') return false;
  const leftKeys = Object.keys(left).sort(), rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index]
      && equal(left[key] as JsonValue, right[key] as JsonValue));
}

function uniqueStrings(value: MergeValue): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
    && new Set(value).size === value.length;
}

function idArray(value: MergeValue): value is JsonObject[] {
  return Array.isArray(value) && value.every(item => isObject(item) && typeof item.id === 'string')
    && new Set(value.map(item => (item as JsonObject).id)).size === value.length;
}

function mergeStringSet(base: string[], local: string[], remote: string[]): string[] {
  const baseSet = new Set(base), localSet = new Set(local), remoteSet = new Set(remote);
  const candidates = [...base, ...local, ...remote];
  const selected: string[] = [];
  for (const item of candidates) {
    if (selected.includes(item)) continue;
    const wasPresent = baseSet.has(item), localPresent = localSet.has(item), remotePresent = remoteSet.has(item);
    const keep = localPresent === wasPresent ? remotePresent
      : remotePresent === wasPresent ? localPresent
        : localPresent;
    if (keep) selected.push(item);
  }
  return selected;
}

function orderedIdMerge(base: JsonObject[], local: JsonObject[], remote: JsonObject[], path: string, conflicts: string[]): JsonValue[] {
  const baseIds = base.map(item => item.id as string);
  const localIds = local.map(item => item.id as string);
  const remoteIds = remote.map(item => item.id as string);
  const baseIndex = new Map(baseIds.map((id, index) => [id, index]));
  const merged = new Map<string, JsonValue>();
  const ids = [...new Set([...baseIds, ...localIds, ...remoteIds])];

  for (const id of ids) {
    const baseItem = base.find(item => item.id === id) ?? MISSING;
    const localItem = local.find(item => item.id === id) ?? MISSING;
    const remoteItem = remote.find(item => item.id === id) ?? MISSING;
    const result = mergeValue(baseItem, localItem, remoteItem, `${path}[id=${id}]`, conflicts);
    if (result !== MISSING) merged.set(id, result as JsonValue);
  }

  if (conflicts.length) return [...merged.values()];
  const edges = new Map([...merged.keys()].map(id => [id, new Set<string>()]));
  const addChangedOrderConstraints = (sequence: string[]) => {
    const present = sequence.filter(id => merged.has(id));
    for (let left = 0; left < present.length; left++) {
      for (let right = left + 1; right < present.length; right++) {
        const before = present[left]!, after = present[right]!;
        const baseBefore = baseIndex.get(before), baseAfter = baseIndex.get(after);
        const newItem = baseBefore === undefined || baseAfter === undefined;
        if (newItem || baseBefore! > baseAfter!) edges.get(before)?.add(after);
      }
    }
  };
  addChangedOrderConstraints(localIds);
  addChangedOrderConstraints(remoteIds);

  const priority = [...baseIds, ...localIds, ...remoteIds];
  const rank = new Map(priority.map((id, index) => [id, index]));
  const ordered: string[] = [];
  const remaining = new Set(merged.keys());
  while (remaining.size) {
    const available = [...remaining]
      .filter(id => ![...edges.entries()].some(([before, after]) => remaining.has(before) && after.has(id)))
      .sort((left, right) => (rank.get(left) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right) ?? Number.MAX_SAFE_INTEGER));
    const next = available[0];
    if (!next) {
      conflicts.push(`${path}.order`);
      return [...merged.values()];
    }
    ordered.push(next);
    remaining.delete(next);
  }
  return ordered.map(id => merged.get(id)!);
}

function appendOnlyMerge(base: MergeValue, local: JsonValue[], remote: JsonValue[]): MergeValue | undefined {
  const previous = Array.isArray(base) ? base : [];
  const retainsBaseOrder = (candidate: JsonValue[]) => {
    let cursor = 0;
    for (const item of candidate) {
      if (cursor < previous.length && equal(item, previous[cursor] as JsonValue)) cursor++;
    }
    return cursor === previous.length;
  };
  if (!retainsBaseOrder(local) || !retainsBaseOrder(remote)) return undefined;
  const combined = [...previous];
  for (const candidate of [...local, ...remote]) {
    if (!combined.some(item => equal(item, candidate))) combined.push(candidate);
  }
  return combined;
}

function mergeValue(base: MergeValue, local: MergeValue, remote: MergeValue, path: string, conflicts: string[]): MergeValue {
  if (equal(local, base)) return remote;
  if (equal(remote, base)) return local;
  if (equal(local, remote)) return local;

  if (isObject(local) && isObject(remote) && (base === MISSING || isObject(base))) {
    const previous = base === MISSING ? {} : base;
    const result: JsonObject = {};
    const keys = new Set([...Object.keys(previous), ...Object.keys(local), ...Object.keys(remote)]);
    for (const key of keys) {
      const next = mergeValue(
        Object.hasOwn(previous, key) ? previous[key]! : MISSING,
        Object.hasOwn(local, key) ? local[key]! : MISSING,
        Object.hasOwn(remote, key) ? remote[key]! : MISSING,
        `${path}.${key}`,
        conflicts,
      );
      if (next !== MISSING) result[key] = next as JsonValue;
    }
    return result;
  }

  if (uniqueStrings(local) && uniqueStrings(remote) && (base === MISSING || uniqueStrings(base))) {
    return mergeStringSet(base === MISSING ? [] : base, local, remote);
  }

  // Replacing AST nodes in the same math sequence is a single editing action,
  // even when both editors generate different node IDs for the replacement.
  if (path.endsWith('.children') && Array.isArray(local) && Array.isArray(remote)
    && (base === MISSING || Array.isArray(base))) {
    conflicts.push(path);
    return local;
  }

  if (idArray(local) && idArray(remote) && (base === MISSING || idArray(base))) {
    return orderedIdMerge(base === MISSING ? [] : base, local, remote, path, conflicts);
  }

  if (Array.isArray(local) && Array.isArray(remote) && (base === MISSING || Array.isArray(base))) {
    const appended = appendOnlyMerge(base, local, remote);
    if (appended !== undefined) return appended;
  }

  conflicts.push(path);
  return local;
}

function parseJson(value: string | null): { ok: true; value: JsonValue | typeof MISSING } | { ok: false } {
  if (value === null) return { ok: true, value: MISSING };
  try { return { ok: true, value: JSON.parse(value) as JsonValue }; }
  catch { return { ok: false }; }
}

type SessionEnvelope = {
  version: 3;
  state: {
    session: JsonObject;
    sync: { revision: number; writerId: string };
  };
};

function isSessionEnvelope(value: JsonValue): value is SessionEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = (value as JsonObject).state;
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  const row = state as JsonObject;
  const session = row.session, sync = row.sync;
  return (value as JsonObject).version === 3
    && !!session && typeof session === 'object' && !Array.isArray(session)
    && !!sync && typeof sync === 'object' && !Array.isArray(sync)
    && Number.isSafeInteger((sync as JsonObject).revision)
    && typeof (sync as JsonObject).writerId === 'string';
}

function mergeSessionEnvelope(base: SessionEnvelope | null, local: SessionEnvelope, remote: SessionEnvelope): { value?: string; paths: string[] } {
  const paths: string[] = [];
  const session = mergeValue(base?.state.session ?? MISSING, local.state.session, remote.state.session, '$.state.session', paths);
  if (paths.length || !isObject(session)) return { paths };
  const revision = Math.max(base?.state.sync.revision ?? 0, local.state.sync.revision, remote.state.sync.revision) + 1;
  return {
    value: JSON.stringify({ version: 3, state: {
      session,
      sync: { revision, writerId: local.state.sync.writerId },
    } }),
    paths,
  };
}

export type ServerValueMerge =
  | { ok: true; value: string | null }
  | { ok: false; conflictPaths: string[] };

/** Three-way merge for JSON records; non-JSON or overlapping edits remain explicit conflicts. */
export function mergeServerStateValues(key: string, baseValue: string | null, localValue: string | null, remoteValue: string | null): ServerValueMerge {
  if (localValue === baseValue) return { ok: true, value: remoteValue };
  if (remoteValue === baseValue || localValue === remoteValue) return { ok: true, value: localValue };

  const base = parseJson(baseValue), local = parseJson(localValue), remote = parseJson(remoteValue);
  if (!base.ok || !local.ok || !remote.ok) return { ok: false, conflictPaths: ['$'] };
  if (key === SESSION_KEY && local.value !== MISSING && remote.value !== MISSING
    && (base.value === MISSING || isSessionEnvelope(base.value))
    && isSessionEnvelope(local.value) && isSessionEnvelope(remote.value)) {
    const result = mergeSessionEnvelope(base.value === MISSING ? null : base.value, local.value, remote.value);
    return result.value === undefined ? { ok: false, conflictPaths: result.paths } : { ok: true, value: result.value };
  }

  const conflictPaths: string[] = [];
  const merged = mergeValue(base.value, local.value, remote.value, '$', conflictPaths);
  if (conflictPaths.length) return { ok: false, conflictPaths };
  if (merged === MISSING) return { ok: true, value: null };
  if (equal(merged, local.value)) return { ok: true, value: localValue };
  if (equal(merged, remote.value)) return { ok: true, value: remoteValue };
  return { ok: true, value: JSON.stringify(merged) };
}

/** Advance the app-local draft revision when the learner explicitly keeps this device's version. */
export function keepLocalServerConflictValue(key: string, localValue: string | null, remoteValue: string | null): string | null {
  if (key !== SESSION_KEY || localValue === null || remoteValue === null) return localValue;
  const local = parseJson(localValue), remote = parseJson(remoteValue);
  if (!local.ok || !remote.ok || local.value === MISSING || remote.value === MISSING
    || !isSessionEnvelope(local.value) || !isSessionEnvelope(remote.value)) return localValue;
  const revision = Math.max(local.value.state.sync.revision, remote.value.state.sync.revision) + 1;
  return JSON.stringify({ version: 3, state: {
    session: local.value.state.session,
    sync: { revision, writerId: local.value.state.sync.writerId },
  } });
}
