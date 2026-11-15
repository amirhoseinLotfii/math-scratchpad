export const MAX_SYNC_STATE_VALUE_BYTES = 1_000_000;
export const SYNC_STATE_BUDGET_BYTES = 950_000;

export const MAX_BANK_BYTES = 1_000_000;
export const MAX_BANK_TEXT_CHARS = 1_000_000;
export const MAX_QUESTIONS_PER_BANK = 1000;

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
