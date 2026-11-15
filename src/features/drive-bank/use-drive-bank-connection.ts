import { bankReadyMessage } from './bank-ready-message';
import { useEffect, useRef, useState } from 'react';
import { GOOGLE_AUTH_STATE_EVENT } from '../../sync/google-auth-state';
import {
  EMPTY_BANK,
  bankCacheStorageKey,
  metaFingerprint,
  parseBankText,
  readBankCache,
  readDriveMeta,
  readPrivateBankText,
  saveBankCache,
  snapshotVersion,
  type DriveBank,
  type DriveMeta,
} from './drive-bank';
import {
  DRIVE_CONFIG_KEY,
  clearDriveSessionToken,
  getConfig,
  loadIdentity,
  loadPicker,
  pickFile,
  readDriveSessionToken,
  refreshDriveSessionTokenSilently,
  saveConfig,
  saveDriveSessionToken,
  type DriveConfig,
  type Token,
} from './google';
import { permittedAccount } from './identity';
import { readBankViaWorker } from './worker-bank';

import type { ScratchStore } from '../../store';
type Options = {
  open: boolean;
  store: ScratchStore;
  onAvailable: (available: boolean) => void;
  onBankReady?: (bank: DriveBank | null, version: string) => void;
  onResumeBank?: (bank: DriveBank, version: string) => void;
};
import { useBankPolling } from './use-bank-polling';
export { POLL_MS } from './use-bank-polling';
export function useDriveBankConnection({ open, store, onAvailable, onBankReady, onResumeBank }: Options) {
  const [config, setConfig] = useState<DriveConfig>(getConfig),
    [connected, setConnected] = useState(false);
  const [message, setMessage] = useState('Connect Google Drive to begin.'),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  const [available, setAvailable] = useState<{ bank: DriveBank; version: string } | null>(null);
  const [checkedAt, setCheckedAt] = useState('');
  const token = useRef<Token | null>(null),
    fingerprint = useRef(''),
    active = useRef(true),
    syncing = useRef(false),
    selectedFileByUser = useRef(false);
  const onBankReadyRef = useRef(onBankReady),
    onAvailableRef = useRef(onAvailable);
  onBankReadyRef.current = onBankReady;
  onAvailableRef.current = onAvailable;
  const cfg = useRef(config);
  cfg.current = config;
  async function restoreCachedBank(fileId: string) {
    if (!fileId) return;
    try {
      const cached = await readBankCache(fileId);
      if (!active.current || cfg.current.fileId !== fileId || !cached) return;
      fingerprint.current = cached.fingerprint;
      setAvailable({ bank: cached.bank, version: cached.version });
      const session = store.getState().doc.session;
      onAvailableRef.current(
        cached.bank.questions.length > 0 && !(session?.bankId === cached.bank.bank_id && session.bankVersion === cached.version),
      );
      onBankReadyRef.current?.(cached.bank, cached.version);
      setMessage(
        `Restored the verified local bank ${cached.bank.bank_id} (${cached.bank.version}); ` +
          'it will be checked against Drive after reconnecting.',
      );
    } catch {
      // A corrupt cache is left untouched; a fresh verified Drive download can replace it.
    }
  }
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      token.current = null;
    };
  }, []);
  useEffect(() => {
    void restoreCachedBank(cfg.current.fileId);
  }, []);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === DRIVE_CONFIG_KEY) {
        const next = getConfig();
        cfg.current = next;
        setConfig(next);
        fingerprint.current = '';
        void restoreCachedBank(next.fileId);
      } else if (event.key === bankCacheStorageKey(cfg.current.fileId)) {
        void restoreCachedBank(cfg.current.fileId);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  useEffect(() => {
    const onGoogleAuthChanged = () => {
      const saved = readDriveSessionToken();
      if (!saved) {
        token.current = null;
        setConnected(false);
        return;
      }
      if (token.current?.accessToken === saved.accessToken) return;
      token.current = saved;
      setConnected(true);
      setMessage('Google Drive is connected. Choose a bank file or check the selected file.');
      if (open && cfg.current.fileId) {
        fingerprint.current = '';
        void sync(true);
      }
    };
    window.addEventListener(GOOGLE_AUTH_STATE_EVENT, onGoogleAuthChanged);
    return () => window.removeEventListener(GOOGLE_AUTH_STATE_EVENT, onGoogleAuthChanged);
  }, [open]);
  useEffect(() => {
    if (!open || ready) return;
    void Promise.all([loadIdentity(), loadPicker().catch(() => undefined)])
      .then(() => {
        if (!active.current) return;
        setReady(true);
        const savedToken = cfg.current.fileId ? readDriveSessionToken() : undefined;
        if (savedToken) {
          setBusy(true);
          void afterToken(savedToken).catch(() => undefined);
        } else if (cfg.current.fileId) {
          void sync(true);
        }
      })
      .catch((e) => {
        if (active.current) setMessage(e instanceof Error ? e.message : 'Google services are unavailable.');
      });
  }, [open, ready]);
  function expire(text: string) {
    token.current = null;
    clearDriveSessionToken();
    setConnected(false);
    setMessage(text);
  }
  const announce = (bank: DriveBank | null, version = '') => {
    const current = store.getState().doc.session;
    onAvailable(!!bank && bank.questions.length > 0 && !(current?.bankId === bank.bank_id && current.bankVersion === version));
  };
  async function sync(force = false) {
    if (syncing.current) return;
    let t = token.current;
    const fileId = cfg.current.fileId;
    // Prefer the Worker: it reads the registered bank with the server Drive credential,
    // so polling continues after the one-hour browser Drive token expires.
    if (fileId) {
      syncing.current = true;
      try {
        const viaWorker = await readBankViaWorker(fileId, cfg.current.fileName, false);
        if (viaWorker && active.current) {
          setConnected(true);
          await applyBank(fileId, viaWorker.meta, force, async () => (await readBankViaWorker(fileId, cfg.current.fileName, true))?.text);
          return;
        }
      } catch (e) {
        if (active.current)
          setMessage(
            `${e instanceof Error ? e.message : 'The bank could not be loaded.'} ` +
              'The previously loaded bank and current session were preserved.',
          );
        return;
      } finally {
        syncing.current = false;
      }
      if (!active.current) return;
    }
    if (!t || Date.now() >= t.expiresAt) {
      const refreshed = await refreshDriveSessionTokenSilently();
      if (!active.current) return;
      if (refreshed) {
        token.current = refreshed;
        t = refreshed;
        setConnected(true);
      } else {
        expire('The Google authorization expired. Select Reconnect to check for updates.');
        return;
      }
    }
    if (!fileId) {
      setMessage('No question bank file is selected.');
      return;
    }
    syncing.current = true;
    try {
      const accessToken = t.accessToken;
      await applyBank(fileId, await readDriveMeta(fileId, accessToken), force, () => readPrivateBankText(fileId, accessToken));
    } catch (e) {
      if (!active.current) return;
      const text = e instanceof Error ? e.message : 'The bank could not be loaded.';
      if (text.includes('expired')) expire(text);
      else setMessage(`${text} ` + 'The previously loaded bank and current session were preserved.');
    } finally {
      syncing.current = false;
    }
  }
  async function applyBank(fileId: string, meta: DriveMeta, force: boolean, readText: () => Promise<string | undefined>) {
    const fp = metaFingerprint(meta);
    if (!active.current) return;
    setCheckedAt(new Date().toLocaleTimeString('en-GB'));
    if (!force && fp === fingerprint.current) return; // unchanged: no download
    const text = await readText();
    if (text === undefined) throw Error('The question bank could not be read. The app will retry later.');
    const parsed = parseBankText(text);
    if (!active.current) return;
    fingerprint.current = fp;
    if (parsed === EMPTY_BANK) {
      setAvailable(null);
      announce(null);
      onBankReady?.(null, '');
      setMessage('Connected. The selected bank file is empty.');
      return;
    }
    const version = await snapshotVersion(parsed);
    const cache = await saveBankCache(fileId, parsed, version, fp);
    setAvailable({ bank: parsed, version });
    announce(parsed, version);
    onBankReady?.(parsed, version);
    // Opening an existing bank is safe only when it matches the active session.
    // Other bank versions still require an explicit "Open received batch" confirmation.
    if (selectedFileByUser.current) {
      selectedFileByUser.current = false;
      onResumeBank?.(parsed, version);
    }
    const current = store.getState().doc.session;
    setMessage(bankReadyMessage(parsed, version, cache, current));
  }
  useBankPolling(connected && open, sync);
  function afterToken(t: Token, accountVerified = false) {
    return (async () => {
      try {
        if (!accountVerified) {
          const who = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${t.accessToken}` },
            cache: 'no-store',
          });
          if (!(await permittedAccount(who.ok ? await who.json() : null)))
            throw Error('This is not the personal project account. Reconnect and choose the correct Google account.');
        }
        token.current = t;
        saveDriveSessionToken(t);
        setConnected(true);
        if (!cfg.current.fileId) {
          choose();
          return;
        }
        fingerprint.current = '';
        await sync(true);
      } catch (e) {
        token.current = null;
        clearDriveSessionToken();
        if (active.current) setMessage(e instanceof Error ? e.message : 'Connection failed.');
        throw e;
      } finally {
        if (active.current) setBusy(false);
      }
    })();
  }
  function choose() {
    const t = token.current;
    if (!t) {
      setMessage('Connect Google Drive first.');
      return;
    }
    pickFile(cfg.current, t.accessToken, (r) => {
      if (!active.current) return;
      if (!r.id) {
        setMessage(r.error ?? 'No file was selected.');
        return;
      }
      const c = { ...cfg.current, fileId: r.id, fileName: r.name ?? '' };
      saveConfig(c);
      setConfig(c);
      cfg.current = c;
      selectedFileByUser.current = true;
      fingerprint.current = '';
      void sync(true);
    });
  }

  return { config, connected, message, busy, ready, available, checkedAt, token, setBusy, setMessage, announce, afterToken, choose, sync };
}
