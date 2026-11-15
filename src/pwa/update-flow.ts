import { flushPersistedSession } from '../features/session/persistence/persistent-store';
import { flushLearningStorage, flushOutboxWrites } from '../sync/browser-db';
import { RELOAD_INTENT_KEY, SUPPORTED_DATA_SCHEMA, type WorkerIdentity, UPDATE_CHANNEL_NAME } from './update-contract';

export { RELOAD_INTENT_KEY, SUPPORTED_DATA_SCHEMA, UPDATE_CHANNEL_NAME } from './update-contract';
export type { WorkerIdentity } from './update-contract';

export function supportsWorkerSchema(identity: WorkerIdentity, supported = SUPPORTED_DATA_SCHEMA): boolean {
  return Number.isSafeInteger(identity.minDataSchema) && identity.minDataSchema >= 0 && identity.minDataSchema <= supported;
}

export async function requestWorkerIdentity(worker: ServiceWorker, timeoutMs = 1500): Promise<WorkerIdentity | null> {
  if (typeof MessageChannel === 'undefined') return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      resolve(null);
    }, timeoutMs);
    channel.port1.onmessage = (event: MessageEvent<WorkerIdentity>) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      const data = event.data;
      resolve(
        data &&
          typeof data.sha === 'string' &&
          Number.isSafeInteger(data.minDataSchema) &&
          (data.killSwitch === undefined || typeof data.killSwitch === 'boolean')
          ? data
          : null,
      );
    };
    worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
  });
}

export async function flushBeforeUpdate(): Promise<void> {
  await flushPersistedSession();
  await flushLearningStorage();
  await flushOutboxWrites();
}

export async function flushThenActivate(flush: () => Promise<void>, activate: () => void): Promise<void> {
  await flush();
  activate();
}

export function consumeReloadIntent(storage: Pick<Storage, 'getItem' | 'setItem'>): boolean {
  if (storage.getItem(RELOAD_INTENT_KEY) !== 'pending') return false;
  storage.setItem(RELOAD_INTENT_KEY, 'done');
  return true;
}

export function clearCompletedReloadIntent(storage: Pick<Storage, 'getItem' | 'removeItem'>): void {
  if (storage.getItem(RELOAD_INTENT_KEY) === 'done') storage.removeItem(RELOAD_INTENT_KEY);
}

export function publishUpdateReady(channel: Pick<BroadcastChannel, 'postMessage'>, identity: WorkerIdentity): void {
  channel.postMessage({ type: 'update-ready', ...identity });
}
