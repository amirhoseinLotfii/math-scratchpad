import { getLearningStorage } from './browser-db';
import {
  learnEventIdSchema,
  learnEventSchema,
  type LearnEvent,
  type LearnEventContext,
  type LearnEventDraft,
} from '../../shared/contracts/learn-event';
export * from '../../shared/contracts/learn-event';

function availableStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return getLearningStorage();
  } catch {
    return undefined;
  }
}

export type LearnEventListener = (event: LearnEvent) => void;
const listeners = new Set<LearnEventListener>();
let inMemoryDeviceId: string | undefined;
const DEVICE_ID_KEY = 'math-scratchpad-device-id-v1';

function uuid(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (!cryptoApi?.getRandomValues) throw new Error('A secure random source is required to create learning event IDs.');
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getDeviceId(storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = availableStorage()): string {
  if (inMemoryDeviceId) return inMemoryDeviceId;
  try {
    const existing = storage?.getItem(DEVICE_ID_KEY);
    if (existing && learnEventIdSchema.safeParse(existing).success) return (inMemoryDeviceId = existing);
  } catch {
    /* local storage may be unavailable; keep the device id in memory. */
  }
  const created = uuid();
  inMemoryDeviceId = created;
  try {
    storage?.setItem(DEVICE_ID_KEY, created);
  } catch {
    /* the later IndexedDB card will own durable event storage. */
  }
  return created;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/** Validate, freeze, and publish one append-only event to any active event sinks. */
export function emit(input: LearnEvent): LearnEvent {
  const event = deepFreeze(learnEventSchema.parse(input));
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      /* A sink must never break the learner's current action. */
    }
  }
  return event;
}

/** Create a schema-v1 event with stable local context, then publish its immutable snapshot. */
export function emitLearnEvent(context: LearnEventContext, draft: LearnEventDraft): LearnEvent {
  const event = {
    id: draft.id ?? uuid(),
    schema: 1 as const,
    ts: draft.ts ?? new Date().toISOString(),
    deviceId: draft.deviceId ?? context.deviceId ?? getDeviceId(),
    bankVersion: draft.bankVersion ?? context.bankVersion ?? 'unknown',
    session: draft.session ?? context.session ?? 'unknown',
    chapter: draft.chapter ?? context.chapter ?? 0,
    lesson: draft.lesson ?? context.lesson ?? 'unknown',
    section: draft.section ?? context.section ?? 'unknown',
    concept: draft.concept ?? context.concept ?? 'unknown',
    ...(context.skill ? { skill: context.skill } : {}),
    ...(context.pdfPage ? { pdfPage: context.pdfPage } : {}),
    ...(context.bookPage ? { bookPage: context.bookPage } : {}),
    ...draft,
    // New app events must be explicitly classified before reaching external mirrors.
    isTest: draft.isTest ?? false,
  };
  return emit(event as LearnEvent);
}

/** Emit an explicitly isolated event for owner-approved live integration checks. */
export function emitTestLearnEvent(context: LearnEventContext, draft: LearnEventDraft): LearnEvent {
  return emitLearnEvent(context, { ...draft, isTest: true });
}

export function subscribeToLearnEvents(listener: LearnEventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetLearnEventRuntimeForTests() {
  listeners.clear();
  inMemoryDeviceId = undefined;
}

export function contextForQuestion(input: {
  bankVersion?: string;
  session?: string;
  chapter?: number;
  lesson?: string;
  section?: string;
  concept?: string;
  skill?: string;
  question?: {
    lessonId?: string;
    sectionId?: string;
    conceptId?: string;
    tags?: { chapter?: string; lesson?: string; section?: string; concept?: string; skill?: string };
  };
  lessonPages?: { startPage?: number; endPage?: number };
}): LearnEventContext {
  const question = input.question;
  const chapterFromTag = Number(question?.tags?.chapter?.match(/\d+/)?.[0]);
  const page = input.lessonPages?.startPage;
  const clean = (value: string | undefined, max: number) => value?.trim().slice(0, max) || 'unknown';
  const skill = input.skill ?? question?.tags?.skill;
  return {
    bankVersion: clean(input.bankVersion, 50),
    session: clean(input.session, 100),
    chapter: input.chapter ?? (Number.isInteger(chapterFromTag) && chapterFromTag > 0 ? chapterFromTag : 0),
    lesson: clean(input.lesson ?? question?.tags?.lesson ?? question?.lessonId, 100),
    section: clean(input.section ?? question?.tags?.section ?? question?.sectionId, 100),
    concept: clean(input.concept ?? question?.tags?.concept ?? question?.conceptId, 120),
    ...(skill?.trim() ? { skill: skill.trim().slice(0, 120) } : {}),
    ...(page ? { bookPage: page } : {}),
  };
}
