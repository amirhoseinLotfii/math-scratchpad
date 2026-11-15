export const SUPPORTED_DATA_SCHEMA = 1;
export const UPDATE_CHANNEL_NAME = 'ms-pwa-v1';
export const RELOAD_INTENT_KEY = 'ms-pwa-reload-intent-v1';
export const UPDATE_STATE_EVENT = 'math-scratchpad:pwa-update-state';

export type WorkerIdentity = { sha: string; minDataSchema: number; killSwitch?: boolean };
