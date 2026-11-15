export const LEARNING_RESET_EPOCH = '2026-11-12-v3';
export const LEARNING_RESET_EPOCH_HEADER = 'X-Math-Scratchpad-Reset-Epoch';

export function isValidLearningResetEpoch(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128 && /^[a-zA-Z0-9._:-]+$/.test(value);
}
