import type { CacheRecord, MetaRecord, OutboxRecord, ServerEventRecord } from '../browser-db';
import { blankCounts, canonicalJson, counts, equal } from './backup-crypto';
import type { LearningBackupPreview, LearningStores, MergePlan } from './backup-types';

export function planMerge(current: LearningStores, incoming: LearningStores): MergePlan {
  const preview: LearningBackupPreview = {
    incoming: counts(incoming),
    additions: blankCounts(),
    alreadyPresent: blankCounts(),
    preservedConflicts: blankCounts(),
    blockingConflicts: [],
    canImport: true,
  };
  const addCache: CacheRecord[] = [], addOutbox: OutboxRecord[] = [], addServerEvents: ServerEventRecord[] = [], addMeta: MetaRecord[] = [];
  const cacheByKey = new Map(current.cache.map(item => [item.key, item]));
  for (const item of incoming.cache) {
    const previous = cacheByKey.get(item.key);
    if (!previous) { addCache.push(item); continue; }
    if (previous.value === item.value) preview.alreadyPresent.cache += 1;
    else preview.preservedConflicts.cache += 1;
  }

  const localEvents = new Map<string, string>();
  const currentServerById = new Map(current.serverEvents.map(item => [item.event.id, { seq: item.seq, content: canonicalJson(item.event) }]));
  for (const item of current.outbox) localEvents.set(item.id, canonicalJson(item.event));
  for (const item of current.serverEvents) localEvents.set(item.event.id, canonicalJson(item.event));
  for (const item of incoming.outbox) {
    const content = canonicalJson(item.event), previous = localEvents.get(item.id);
    if (previous !== undefined) {
      if (previous !== content) preview.blockingConflicts.push(`رویداد ${item.id} با محتوای متفاوت وجود دارد.`);
      else preview.alreadyPresent.outbox += 1;
      continue;
    }
    addOutbox.push(item);
    localEvents.set(item.id, content);
  }

  const currentServerBySeq = new Map(current.serverEvents.map(item => [item.seq, item]));
  for (const item of incoming.serverEvents) {
    const byId = currentServerById.get(item.event.id);
    if (byId) {
      if (byId.seq !== item.seq || byId.content !== canonicalJson(item.event)) preview.blockingConflicts.push(`ترتیب تاریخچهٔ رویداد ${item.event.id} با نسخهٔ موجود فرق دارد.`);
      else preview.alreadyPresent.serverEvents += 1;
      continue;
    }
    const bySeq = currentServerBySeq.get(item.seq);
    if (bySeq) {
      if (bySeq.event.id !== item.event.id || canonicalJson(bySeq.event) !== canonicalJson(item.event)) preview.blockingConflicts.push(`شمارهٔ ${item.seq} در دو تاریخچه به رویدادهای متفاوت تعلق دارد.`);
      else preview.alreadyPresent.serverEvents += 1;
      continue;
    }
    addServerEvents.push(item);
    currentServerById.set(item.event.id, { seq: item.seq, content: canonicalJson(item.event) });
    currentServerBySeq.set(item.seq, item);
  }

  const metaByKey = new Map(current.meta.map(item => [item.key, item]));
  for (const item of incoming.meta) {
    const previous = metaByKey.get(item.key);
    if (!previous) { addMeta.push(item); continue; }
    if (equal(previous.value, item.value)) preview.alreadyPresent.meta += 1;
    else preview.preservedConflicts.meta += 1;
  }

  const mergedServerIds = new Set([...current.serverEvents, ...addServerEvents].map(item => item.event.id));
  const removeOutboxIds = current.outbox.filter(item => mergedServerIds.has(item.id)).map(item => item.id);
  for (const item of addOutbox) if (mergedServerIds.has(item.id)) {
    const index = addOutbox.findIndex(candidate => candidate.id === item.id);
    if (index >= 0) addOutbox.splice(index, 1);
    preview.alreadyPresent.outbox += 1;
  }

  preview.additions = { cache: addCache.length, outbox: addOutbox.length, serverEvents: addServerEvents.length, meta: addMeta.length };
  preview.canImport = preview.blockingConflicts.length === 0;
  return { preview, cache: addCache, outbox: addOutbox, serverEvents: addServerEvents, meta: addMeta, removeOutboxIds };
}
