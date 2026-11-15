export const MAX_SYNC_STATE_VALUE_BYTES = 1_000_000;
export const SYNC_STATE_BUDGET_BYTES = 950_000;

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
