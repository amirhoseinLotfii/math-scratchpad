import * as z from 'zod/mini';
import { learnEventSchema } from './learn-event';
import { isLearningStorageKey } from './storage-keys';

export const WS_SYNC_PROTOCOL = 'ms-sync/1' as const;
const UUID = z.uuidv4();
const NON_NEGATIVE_INT = z.int().check(z.minimum(0), z.maximum(Number.MAX_SAFE_INTEGER));
const BOUNDED_STRING = (max: number) => z.string().check(z.minLength(1), z.maxLength(max));

const helloSchema = z.strictObject({
  protocol: z.literal(WS_SYNC_PROTOCOL),
  type: z.literal('hello'),
  deviceId: UUID,
  epoch: BOUNDED_STRING(100),
  cursor: NON_NEGATIVE_INT,
  stateRevision: NON_NEGATIVE_INT,
  appSha: BOUNDED_STRING(200),
});

const eventsPushSchema = z.strictObject({
  protocol: z.literal(WS_SYNC_PROTOCOL),
  type: z.literal('events.push'),
  events: z.array(learnEventSchema).check(z.minLength(1), z.maxLength(50)),
});

const statePutSchema = z.strictObject({
  protocol: z.literal(WS_SYNC_PROTOCOL),
  type: z.literal('state.put'),
  key: BOUNDED_STRING(200),
  value: z.nullable(z.string()),
  baseRevision: NON_NEGATIVE_INT,
});

const pingSchema = z.strictObject({
  protocol: z.literal(WS_SYNC_PROTOCOL),
  type: z.literal('ping'),
});

export const wsClientMessageSchema = z.union([helloSchema, eventsPushSchema, statePutSchema, pingSchema]);
export type WsClientMessage = z.infer<typeof wsClientMessageSchema>;

const sequencedEventSchema = z.strictObject({ seq: NON_NEGATIVE_INT, event: learnEventSchema });
const welcomeSchema = z.strictObject({
  protocol: z.literal(WS_SYNC_PROTOCOL),
  type: z.literal('welcome'),
  serverCursor: NON_NEGATIVE_INT,
  epoch: z.nullable(z.string()),
  resetStatus: BOUNDED_STRING(100),
});
const eventsSchema = z.strictObject({
  protocol: z.literal(WS_SYNC_PROTOCOL),
  type: z.literal('events'),
  from: NON_NEGATIVE_INT,
  to: NON_NEGATIVE_INT,
  events: z.array(sequencedEventSchema).check(z.minLength(1), z.maxLength(100)),
});
const ackSchema = z.strictObject({
  protocol: z.literal(WS_SYNC_PROTOCOL),
  type: z.literal('ack'),
  eventIds: z.array(z.string()).check(z.maxLength(50)),
  seq: NON_NEGATIVE_INT,
});
const stateChangedSchema = z.strictObject({
  protocol: z.literal(WS_SYNC_PROTOCOL),
  type: z.literal('state.changed'),
  key: BOUNDED_STRING(200),
  value: z.nullable(z.string()),
  revision: NON_NEGATIVE_INT,
  sourceDevice: UUID,
});
const stateConflictSchema = z.strictObject({
  protocol: z.literal(WS_SYNC_PROTOCOL),
  type: z.literal('state.conflict'),
  key: BOUNDED_STRING(200),
  localRevision: NON_NEGATIVE_INT,
  remote: z.strictObject({ value: z.nullable(z.string()), revision: NON_NEGATIVE_INT }),
});
const resetSchema = z.strictObject({
  protocol: z.literal(WS_SYNC_PROTOCOL),
  type: z.literal('reset'),
  status: BOUNDED_STRING(100),
  epoch: z.nullable(z.string()),
});
const errorSchema = z.strictObject({
  protocol: z.literal(WS_SYNC_PROTOCOL),
  type: z.literal('error'),
  code: BOUNDED_STRING(100),
  retryable: z.boolean(),
});
const pongSchema = z.strictObject({ protocol: z.literal(WS_SYNC_PROTOCOL), type: z.literal('pong') });

export const wsServerMessageSchema = z.union([
  welcomeSchema,
  eventsSchema,
  ackSchema,
  stateChangedSchema,
  stateConflictSchema,
  resetSchema,
  errorSchema,
  pongSchema,
]);
export type WsServerMessage = z.infer<typeof wsServerMessageSchema>;

function parseJson(value: string | ArrayBuffer): unknown {
  if (typeof value !== 'string') return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function parseWsClientMessage(value: string | ArrayBuffer): WsClientMessage | undefined {
  const result = wsClientMessageSchema.safeParse(parseJson(value));
  if (!result.success) return undefined;
  if (result.data.type === 'state.put' && !isLearningStorageKey(result.data.key)) return undefined;
  return result.data;
}

export function parseWsServerMessage(value: string | ArrayBuffer): WsServerMessage | undefined {
  const result = wsServerMessageSchema.safeParse(parseJson(value));
  return result.success ? result.data : undefined;
}

export function encodeWsServerMessage(message: WsServerMessage): string {
  return JSON.stringify(message);
}

export function encodeWsClientMessage(message: WsClientMessage): string {
  return JSON.stringify(message);
}
