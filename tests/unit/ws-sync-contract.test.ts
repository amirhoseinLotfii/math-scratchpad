import { describe, expect, it } from 'vitest';
import { encodeWsServerMessage, parseWsClientMessage, WS_SYNC_PROTOCOL } from '../../shared/contracts/ws-sync';
import { isLearningStorageKey } from '../../shared/contracts/storage-keys';

const DEVICE_ID = '11111111-1111-4111-8111-111111111111';

describe('ms-sync/1 contract', () => {
  it('accepts a complete hello and rejects unknown keys', () => {
    const message = parseWsClientMessage(
      JSON.stringify({
        protocol: WS_SYNC_PROTOCOL,
        type: 'hello',
        deviceId: DEVICE_ID,
        epoch: 'epoch-1',
        cursor: 4,
        stateRevision: 2,
        appSha: 'test-sha',
      }),
    );
    expect(message?.type).toBe('hello');
    expect(
      parseWsClientMessage(
        JSON.stringify({
          protocol: WS_SYNC_PROTOCOL,
          type: 'ping',
          unexpected: true,
        }),
      ),
    ).toBeUndefined();
  });

  it('accepts validated event batches and rejects non-allowlisted state keys', () => {
    const event = {
      id: '22222222-2222-4222-8222-222222222222',
      schema: 1,
      ts: '2026-11-15T10:00:00.000Z',
      deviceId: DEVICE_ID,
      bankVersion: 'v1',
      session: 'session-1',
      chapter: 1,
      lesson: '1.1',
      section: '1.1',
      concept: 'fractions',
      type: 'lesson_open',
    };
    expect(parseWsClientMessage(JSON.stringify({ protocol: WS_SYNC_PROTOCOL, type: 'events.push', events: [event] }))?.type).toBe(
      'events.push',
    );
    expect(
      parseWsClientMessage(
        JSON.stringify({ protocol: WS_SYNC_PROTOCOL, type: 'state.put', key: 'other-app-key', value: 'x', baseRevision: 0 }),
      ),
    ).toBeUndefined();
    expect(
      parseWsClientMessage(
        JSON.stringify({
          protocol: WS_SYNC_PROTOCOL,
          type: 'state.put',
          key: 'math-scratchpad-not-a-real-key',
          value: 'x',
          baseRevision: 0,
        }),
      ),
    ).toBeUndefined();
    for (const key of [
      'math-scratchpad-session-v3',
      'math-scratchpad-lesson-progress-v1:bank:1',
      'math-scratchpad-reading-position-v1:device',
      'math-scratchpad-inline-fractions-round1-v1',
    ]) {
      expect(isLearningStorageKey(key)).toBe(true);
      expect(
        parseWsClientMessage(JSON.stringify({ protocol: WS_SYNC_PROTOCOL, type: 'state.put', key, value: 'x', baseRevision: 0 }))?.type,
      ).toBe('state.put');
    }
  });

  it('encodes server messages as protocol-tagged JSON', () => {
    expect(JSON.parse(encodeWsServerMessage({ protocol: WS_SYNC_PROTOCOL, type: 'pong' }))).toEqual({
      protocol: WS_SYNC_PROTOCOL,
      type: 'pong',
    });
  });
});
