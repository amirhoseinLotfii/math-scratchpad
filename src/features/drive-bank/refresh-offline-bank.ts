import { EMPTY_BANK, metaFingerprint, parseBankText, readPrivateBankText, readDriveMeta, snapshotVersion } from './drive-bank';
import { getConfig, readDriveSessionToken, refreshDriveSessionTokenSilently } from './google';
import { readBankViaWorker } from './worker-bank';
import { saveVerifiedBank } from './save-verified-bank';

export type RegisteredBankRefresh = 'saved' | 'unavailable' | 'none' | 'empty';

/** Refresh the selected bank with the existing verified Worker/Drive paths when online. */
export async function refreshRegisteredOfflineBank(): Promise<RegisteredBankRefresh> {
  if (typeof navigator === 'undefined' || !navigator.onLine) return 'unavailable';
  const config = getConfig();
  if (!config.fileId) return 'none';

  const viaWorker = await readBankViaWorker(config.fileId, config.fileName, true);
  if (viaWorker) {
    const bank = parseBankText(viaWorker.text ?? '');
    if (bank === EMPTY_BANK) return 'empty';
    const version = await snapshotVersion(bank);
    const { offlineWarning } = await saveVerifiedBank(config.fileId, bank, version, metaFingerprint(viaWorker.meta));
    if (offlineWarning) throw new Error(offlineWarning);
    return 'saved';
  }

  const token = (await refreshDriveSessionTokenSilently()) ?? readDriveSessionToken();
  if (!token) return 'unavailable';
  const meta = await readDriveMeta(config.fileId, token.accessToken);
  const bank = parseBankText(await readPrivateBankText(config.fileId, token.accessToken));
  if (bank === EMPTY_BANK) return 'empty';
  const version = await snapshotVersion(bank);
  const { offlineWarning } = await saveVerifiedBank(config.fileId, bank, version, metaFingerprint(meta));
  if (offlineWarning) throw new Error(offlineWarning);
  return 'saved';
}
