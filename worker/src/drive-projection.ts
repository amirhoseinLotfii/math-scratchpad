import { learnEventSchema, type LearnEvent } from '../../src/sync/events';

export type SequencedLearnEvent = { seq: number; event: LearnEvent };
export type DrivePosition = { chapter: number; lesson: string; section: string; chunkId?: string };
export type DriveProgressProjection = {
  schemaVersion: 1;
  currentPosition: DrivePosition | null;
  gateStatusBySection: Record<string, 'attempted' | 'passed' | 'failed'>;
  completedSections: string[];
  completedLessons: string[];
  unlockedSections: string[];
  bankVersion: string | null;
  lastEventId: string | null;
  lastSeq: number;
  updatedAtUtc: string;
  timeZone: 'Asia/Tehran';
  updatedAtTehran: string;
};

export type DriveSyncManifest = {
  schemaVersion: 1;
  lastSeq: number;
  lastEventId: string | null;
  lastSuccessAtUtc: string;
  lastSuccessAtTehran: string;
  files: Array<{ path: string; sha256: string }>;
  quarantinedEventCount: number;
};

const POSITION_EVENTS = new Set<LearnEvent['type']>([
  'lesson_open', 'chunk_open', 'chunk_read', 'section_open', 'question_open', 'check_answer',
  'example_attempt', 'tryit_attempt', 'exercise_attempt', 'mixed_review_attempt', 'section_complete',
  'lesson_complete', 'gate_attempt', 'gate_passed', 'gate_failed',
]);

/** One private Drive JSONL file per UTC month, ordered by the Durable Object sequence. */
export function groupEventsByUtcMonth(events: readonly SequencedLearnEvent[]): Map<string, SequencedLearnEvent[]> {
  const grouped = new Map<string, SequencedLearnEvent[]>();
  for (const item of [...events].sort((a, b) => a.seq - b.seq)) {
    const date = new Date(item.event.ts);
    if (!Number.isFinite(date.getTime())) throw new Error('invalid_event_timestamp');
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const monthEvents = grouped.get(month) ?? [];
    monthEvents.push(item);
    grouped.set(month, monthEvents);
  }
  return grouped;
}

export function serializeJsonlEvents(events: readonly SequencedLearnEvent[]): string {
  if (events.length === 0) return '';
  return [...events].sort((a, b) => a.seq - b.seq).map(item => JSON.stringify(item.event)).join('\n') + '\n';
}

export function mergeJsonlEventContent(remote: string, desired: string): string {
  const remoteEvents = parseJsonlEvents(remote);
  const desiredEvents = parseJsonlEvents(desired);
  const byId = new Map<string, LearnEvent>();
  const order: string[] = [];
  for (const event of remoteEvents) {
    const existing = byId.get(event.id);
    if (existing && canonicalJson(existing) !== canonicalJson(event)) throw new Error('event_id_conflict');
    if (!existing) order.push(event.id);
    byId.set(event.id, event);
  }
  for (const event of desiredEvents) {
    const existing = byId.get(event.id);
    if (existing) {
      if (canonicalJson(existing) !== canonicalJson(event)) throw new Error('event_id_conflict');
      continue;
    }
    order.push(event.id);
    byId.set(event.id, event);
  }
  return order.length === 0 ? '' : order.map(id => JSON.stringify(byId.get(id))).join('\n') + '\n';
}

/** Commutative, idempotent union used by recovery and property tests. */
export function mergeUniqueEvents(...collections: ReadonlyArray<ReadonlyArray<LearnEvent>>): LearnEvent[] {
  const byId = new Map<string, LearnEvent>();
  for (const collection of collections) {
    for (const candidate of collection) {
      const event = learnEventSchema.parse(candidate);
      const existing = byId.get(event.id);
      if (existing && canonicalJson(existing) !== canonicalJson(event)) throw new Error('event_id_conflict');
      byId.set(event.id, event);
    }
  }
  return [...byId.values()].sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id));
}

export function buildProgressProjection(events: readonly SequencedLearnEvent[], now = new Date()): DriveProgressProjection {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const learningEvents = ordered.filter(({ event }) => event.isTest === false);
  let currentPosition: DrivePosition | null = null;
  const gateStatusBySection: DriveProgressProjection['gateStatusBySection'] = {};
  const completedSections = new Set<string>();
  const completedLessons = new Set<string>();

  for (const { event } of learningEvents) {
    const sectionKey = sectionKeyFor(event);
    if (sectionKey && POSITION_EVENTS.has(event.type)) {
      if (!currentPosition || currentPosition.chapter !== event.chapter
        || currentPosition.lesson !== event.lesson || currentPosition.section !== event.section) {
        currentPosition = { chapter: event.chapter, lesson: event.lesson, section: event.section };
      }
      if (event.type === 'chunk_open' && event.itemId) currentPosition.chunkId = event.itemId;
    }
    if (sectionKey && event.type === 'gate_attempt') gateStatusBySection[sectionKey] = 'attempted';
    if (sectionKey && event.type === 'gate_failed') gateStatusBySection[sectionKey] = 'failed';
    if (sectionKey && event.type === 'gate_passed') gateStatusBySection[sectionKey] = 'passed';
    if (sectionKey && event.type === 'section_complete') completedSections.add(sectionKey);
    if (event.type === 'lesson_complete') completedLessons.add(`${event.chapter}:${event.lesson}`);
  }

  const latest = learningEvents.at(-1);
  const unlockedSections = new Set<string>(completedSections);
  for (const [key, status] of Object.entries(gateStatusBySection)) if (status === 'passed') unlockedSections.add(key);
  const updatedAtUtc = now.toISOString();
  return {
    schemaVersion: 1,
    currentPosition,
    gateStatusBySection,
    completedSections: [...completedSections].sort(),
    completedLessons: [...completedLessons].sort(),
    unlockedSections: [...unlockedSections].sort(),
    bankVersion: latest?.event.bankVersion ?? null,
    lastEventId: latest?.event.id ?? null,
    lastSeq: latest?.seq ?? 0,
    updatedAtUtc,
    timeZone: 'Asia/Tehran',
    updatedAtTehran: formatTehran(now),
  };
}

export async function sha256Hex(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildSyncManifest(input: {
  events: readonly SequencedLearnEvent[];
  eventFiles: ReadonlyArray<{ path: string; content: string }>;
  progressContent: string;
  now?: Date;
}): Promise<DriveSyncManifest> {
  const latest = [...input.events].sort((a, b) => a.seq - b.seq).at(-1);
  const files = await Promise.all([
    ...input.eventFiles.map(async file => ({ path: file.path, sha256: await sha256Hex(file.content) })),
    sha256Hex(input.progressContent).then(sha256 => ({ path: 'state/progress.json', sha256 })),
  ]);
  const now = input.now ?? new Date();
  return {
    schemaVersion: 1,
    lastSeq: latest?.seq ?? 0,
    lastEventId: latest?.event.id ?? null,
    lastSuccessAtUtc: now.toISOString(),
    lastSuccessAtTehran: formatTehran(now),
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
    quarantinedEventCount: input.events.filter(({ event }) => typeof event.isTest !== 'boolean').length,
  };
}

export function sectionKeyFor(event: LearnEvent): string | null {
  if (event.chapter < 1 || event.lesson === 'unknown' || event.section === 'unknown') return null;
  return `${event.chapter}:${event.lesson}:${event.section}`;
}

function parseJsonlEvents(content: string): LearnEvent[] {
  if (!content.trim()) return [];
  const events: LearnEvent[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let raw: unknown;
    try { raw = JSON.parse(line); } catch { throw new Error('invalid_jsonl'); }
    const parsed = learnEventSchema.safeParse(raw);
    if (!parsed.success) throw new Error('invalid_jsonl_event');
    events.push(parsed.data);
  }
  return events;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function formatTehran(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = (name: string) => parts.find(part => part.type === name)?.value ?? '';
  const year = value('year');
  const month = value('month');
  const day = value('day');
  const hour = value('hour');
  const minute = value('minute');
  const second = value('second');
  const localAsUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const offsetMinutes = Math.round((localAsUtc - Math.floor(date.getTime() / 1_000) * 1_000) / 60_000);
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
}
