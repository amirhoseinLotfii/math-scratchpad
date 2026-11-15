import type { SessionMeta } from '../../model';
import type { saveBankCache } from './drive-bank';
import type { DriveBank } from './bank-types';

export function bankReadyMessage(
  bank: DriveBank,
  version: string,
  cache: Awaited<ReturnType<typeof saveBankCache>>,
  current?: SessionMeta,
) {
  const ready = bank.questions.length
    ? `Bank ${bank.bank_id} (version ${bank.version}) loaded; ${bank.questions.length} questions ready.`
    : 'Connected. The bank has no questions yet.';
  const cached = cache.saved ? 'A verified local copy is ready for offline use.' : cache.message;
  const hasLessonWarnings = bank.parseWarnings?.some((item) => item.startsWith('lessons'));
  const changed = current?.bankId === bank.bank_id && !!current.bankVersion && current.bankVersion !== version;
  return [
    ready,
    cached,
    hasLessonWarnings && 'Some lesson content could not be read. You can continue with the bank questions.',
    changed && 'This bank version differs from the current session; the current session was not changed.',
    bank.lessons?.length && 'Lesson progress is kept separately for each bank version.',
  ]
    .filter(Boolean)
    .join(' ');
}
