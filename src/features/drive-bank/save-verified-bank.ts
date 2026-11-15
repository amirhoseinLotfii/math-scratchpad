import { saveBankCache, type DriveBank } from './drive-bank';
import { requestImageCache } from '../../pwa/collect-image-urls';
import { saveOfflineBank } from '../../pwa/offline-bank-cache';

export async function saveVerifiedBank(fileId: string, bank: DriveBank, version: string, fingerprint: string) {
  const legacyCache = await saveBankCache(fileId, bank, version, fingerprint);
  let offlineWarning = '';
  try {
    const result = await saveOfflineBank(fileId, bank, version, fingerprint);
    if (!result.saved) offlineWarning = 'فضای ذخیره‌سازی برای کپی آفلاین کافی نیست؛ نسخهٔ محلی قبلی حفظ شد.';
  } catch {
    offlineWarning = 'کپی آفلاین بانک تأیید نشد؛ نسخهٔ قبلی حفظ شد.';
  }
  requestImageCache([bank]);
  return { legacyCache, offlineWarning };
}
