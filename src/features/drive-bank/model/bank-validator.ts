import type { DriveBank } from '../../../domain/entities/drive-bank.types';
import { BANK_SCHEMA, EMPTY_BANK, MAX_QUESTIONS_PER_BANK, snapshotVersion, validateBank } from '../../../domain/validation/bank-validator';

export { BANK_SCHEMA, EMPTY_BANK, MAX_QUESTIONS_PER_BANK, snapshotVersion, validateBank };

/** Parse bank text; an empty file is a valid "no questions yet" state, not a crash. */
export function parseBankText(body: string): DriveBank | typeof EMPTY_BANK {
  if (body.length > 1000000) throw Error('The bank file is too large.');
  if (!body.replace(/^\uFEFF/, '').trim()) return EMPTY_BANK;
  let json: unknown;
  try { json = JSON.parse(body.replace(/^\uFEFF/, '')); } catch { throw Error('The bank file is not valid JSON. The current session was not changed.'); }
  const bank = validateBank(json);
  if (import.meta.env.DEV && bank.parseWarnings?.length) console.warn('[Math Scratchpad] Bank content warnings:', bank.parseWarnings);
  return bank;
}
