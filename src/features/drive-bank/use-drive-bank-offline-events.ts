import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { bankCacheStorageKey, type DriveBank } from './drive-bank';
import { DRIVE_CONFIG_KEY, getConfig, type DriveConfig } from './google';
import { findRestorableBank } from './offline-bank-restore';
import { requestPersistentStorageOnce } from '../../pwa/storage-persistence';
import type { ScratchStore } from '../../store';

type BankReady = (bank: DriveBank | null, version: string) => void;
type ResumeBank = (bank: DriveBank, version: string) => void;
type Options = {
  config: MutableRefObject<DriveConfig>;
  fingerprint: MutableRefObject<string>;
  active: MutableRefObject<boolean>;
  store: ScratchStore;
  onAvailable: MutableRefObject<(available: boolean) => void>;
  onBankReady: MutableRefObject<BankReady | undefined>;
  onResumeBank: MutableRefObject<ResumeBank | undefined>;
  setAvailable: Dispatch<SetStateAction<{ bank: DriveBank; version: string } | null>>;
  setConfig: Dispatch<SetStateAction<DriveConfig>>;
  setMessage: Dispatch<SetStateAction<string>>;
  setOnline: Dispatch<SetStateAction<boolean>>;
};

export function useDriveBankOfflineEvents({
  config,
  fingerprint,
  active,
  store,
  onAvailable,
  onBankReady,
  onResumeBank,
  setAvailable,
  setConfig,
  setMessage,
  setOnline,
}: Options) {
  async function restoreCachedBank(fileId: string) {
    try {
      const cached = await findRestorableBank(fileId, store.getState().doc.session);
      if (!active.current || config.current.fileId !== fileId || !cached) return;
      void requestPersistentStorageOnce();
      fingerprint.current = cached.fingerprint;
      setAvailable({ bank: cached.bank, version: cached.version });
      onAvailable.current(
        cached.bank.questions.length > 0 &&
          !(store.getState().doc.session?.bankId === cached.bank.bank_id &&
            store.getState().doc.session?.bankVersion === cached.version),
      );
      onBankReady.current?.(cached.bank, cached.version);
      if (cached.resume) onResumeBank.current?.(cached.bank, cached.version);
      setMessage(
        `Restored the verified local bank ${cached.bank.bank_id} (${cached.bank.version}); ` +
          (navigator.onLine ? 'it will be checked against Drive.' : 'it is ready to use offline.'),
      );
    } catch {
      // A corrupt cache is left untouched; a fresh verified Drive download can replace it.
    }
  }

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => {
      setOnline(false);
      setMessage('برای ورود Google، دریافت بانک از Drive و بررسی به‌روزرسانی بانک به اینترنت نیاز است.');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    void restoreCachedBank(config.current.fileId);
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === DRIVE_CONFIG_KEY) {
        const next = getConfig();
        config.current = next;
        setConfig(next);
        fingerprint.current = '';
        void restoreCachedBank(next.fileId);
      } else if (event.key === bankCacheStorageKey(config.current.fileId)) {
        void restoreCachedBank(config.current.fileId);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
}
