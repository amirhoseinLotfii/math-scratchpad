import { describe, expect, it } from 'vitest';
import {
  clearCompletedReloadIntent,
  consumeReloadIntent,
  flushThenActivate,
  publishUpdateReady,
  supportsWorkerSchema,
} from '../../../src/pwa/update-flow';
import { RELOAD_INTENT_KEY } from '../../../src/pwa/update-contract';

describe('safe service-worker updates', () => {
  it('accepts only data schemas supported by the current app', () => {
    expect(supportsWorkerSchema({ sha: 'a', minDataSchema: 1 })).toBe(true);
    expect(supportsWorkerSchema({ sha: 'b', minDataSchema: 2 })).toBe(false);
    expect(supportsWorkerSchema({ sha: 'c', minDataSchema: -1 })).toBe(false);
  });

  it('flushes local state before asking a waiting worker to activate', async () => {
    const order: string[] = [];
    await flushThenActivate(
      async () => void order.push('flush'),
      () => void order.push('activate'),
    );
    expect(order).toEqual(['flush', 'activate']);
  });

  it('consumes a reload intent once and clears the completed guard', () => {
    const values = new Map<string, string>([[RELOAD_INTENT_KEY, 'pending']]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    expect(consumeReloadIntent(storage)).toBe(true);
    expect(consumeReloadIntent(storage)).toBe(false);
    clearCompletedReloadIntent(storage);
    expect(values.has(RELOAD_INTENT_KEY)).toBe(false);
  });

  it('broadcasts update availability without requesting other tabs to reload', () => {
    const messages: unknown[] = [];
    publishUpdateReady({ postMessage: (message) => messages.push(message) }, { sha: 'build-b', minDataSchema: 1 });
    expect(messages).toEqual([{ type: 'update-ready', sha: 'build-b', minDataSchema: 1 }]);
  });
});
