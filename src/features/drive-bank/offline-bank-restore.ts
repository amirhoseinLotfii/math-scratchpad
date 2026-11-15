import { readBankCache, type CachedBank, type DriveBank } from './drive-bank';
import { listOfflineBanks, readOfflineBank } from '../../pwa/offline-bank-cache';

export type RestoredBank = { bank: DriveBank; version: string; fingerprint: string; resume: boolean };
type CurrentBankSession = { bankId?: string; bankVersion?: string } | null | undefined;

export async function findRestorableBank(fileId: string, session: CurrentBankSession): Promise<RestoredBank | null> {
  let legacyCache: CachedBank | null = null;
  if (fileId) {
    try {
      legacyCache = await readBankCache(fileId);
    } catch {
      // A bad old cache must not prevent the additive IndexedDB fallback.
    }
  }
  const offlineBanks = (await listOfflineBanks().catch(() => ({ banks: [], corruptCount: 0 }))).banks;
  const sessionMatch = session?.bankId
    ? offlineBanks.find((item) => item.bank.bank_id === session.bankId && item.contentVersion === session.bankVersion)
    : undefined;
  const fileCache = fileId ? await readOfflineBank(fileId).catch(() => null) : null;
  const cached = legacyCache
    ? { bank: legacyCache.bank, version: legacyCache.version, fingerprint: legacyCache.fingerprint }
    : fileCache
      ? { bank: fileCache.bank, version: fileCache.contentVersion, fingerprint: fileCache.fingerprint }
      : sessionMatch
        ? { bank: sessionMatch.bank, version: sessionMatch.contentVersion, fingerprint: sessionMatch.fingerprint }
        : offlineBanks[0]
          ? {
              bank: offlineBanks[0].bank,
              version: offlineBanks[0].contentVersion,
              fingerprint: offlineBanks[0].fingerprint,
            }
          : null;
  if (!cached) return null;
  return {
    ...cached,
    resume: sessionMatch?.bank.bank_id === cached.bank.bank_id && sessionMatch.contentVersion === cached.version,
  };
}
