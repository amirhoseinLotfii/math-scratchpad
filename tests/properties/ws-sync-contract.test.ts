import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isLearningStorageKey } from '../../shared/contracts/storage-keys';
import { parseWsClientMessage, WS_SYNC_PROTOCOL } from '../../shared/contracts/ws-sync';

const PROPERTY_OPTIONS = { seed: 20261115, numRuns: 5_000 };

describe('PROP: WebSocket sync contract rejects malformed and out-of-scope input', () => {
  it('never accepts a state key outside the shared storage allowlist', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 300 }), (key) => {
        const parsed = parseWsClientMessage(
          JSON.stringify({ protocol: WS_SYNC_PROTOCOL, type: 'state.put', key, value: 'value', baseRevision: 0 }),
        );
        if (!isLearningStorageKey(key)) expect(parsed).toBeUndefined();
        else expect(parsed?.type).toBe('state.put');
      }),
      PROPERTY_OPTIONS,
    );
  });

  it('parses arbitrary JSON text without throwing and only returns contract messages', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const text = JSON.stringify(value);
        expect(() => parseWsClientMessage(text)).not.toThrow();
        const parsed = parseWsClientMessage(text);
        if (parsed) expect(parsed.protocol).toBe(WS_SYNC_PROTOCOL);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it('rejects arbitrary non-JSON strings deterministically', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2_000 }), (value) => {
        const parsed = parseWsClientMessage(value);
        if (parsed) expect(() => JSON.parse(value)).not.toThrow();
      }),
      PROPERTY_OPTIONS,
    );
  });
});
