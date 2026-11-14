import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { getAuthenticatedServerStorage, isLocalLearningResetPending, readQuarantineCount } from './browser-db';
import { ensureWorkerSession } from './worker-session';
import { GoogleLoginButton } from './google-login-button';
import { verifyOwnerServerConnection } from './server-storage';
import { isServerResetStatusVerified, LOCAL_RESET_STATE_CHANGED_EVENT } from './learning-reset-epoch';

type GateState = { kind: 'checking' | 'online' | 'blocked'; message: string };
const INITIAL: GateState = { kind: 'checking', message: 'در حال بررسی همگام‌سازی…' };
const TIMEOUT_MS = 7_000;
const PING_INTERVAL_MS = 30_000;

export const ServerConnectionOverlayContext = createContext<(open: boolean) => void>(() => {});

function localStorageMessage(): string {
  return 'تمرین‌ها روی این دستگاه ذخیره می‌شوند.';
}

function isLocalOnlyMode(): boolean {
  return isLocalLearningResetPending() || !isServerResetStatusVerified();
}

/** Keeps the editor usable from durable local data while the server is unavailable. */
export function ServerConnectionGate({ children, tokenProvider, onAuthenticated, flushPendingDraft }: {
  children: ReactNode;
  tokenProvider: () => string | undefined;
  onAuthenticated: (token: string) => Promise<void>;
  flushPendingDraft: () => Promise<void>;
}) {
  const [state, setState] = useState<GateState>(INITIAL);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [resetPending, setResetPending] = useState(isLocalOnlyMode());
  const [quarantinedCount, setQuarantinedCount] = useState(0);
  const checking = useRef(false);
  const rerunAfterCheck = useRef(false);
  const mounted = useRef(false);
  const epoch = useRef(0);
  const activeCheck = useRef<AbortController | null>(null);

  const check = useCallback(async () => {
    if (isLocalOnlyMode()) {
      epoch.current += 1;
      activeCheck.current?.abort();
      setResetPending(true);
      setState({ kind: 'blocked', message: 'حالت محلی فعال است؛ پاسخ‌ها روی همین دستگاه ذخیره می‌شوند و پس از تأیید سرور همگام خواهند شد.' });
      return;
    }
    setResetPending(false);
    if (checking.current) {
      // StrictMode and visibility events can request another check while auth restores.
      // Queue one follow-up so the in-flight request cannot leave the gate stuck checking.
      rerunAfterCheck.current = true;
      return;
    }
    const id = ++epoch.current;
    if (navigator.onLine === false) {
      setState({ kind: 'blocked', message: `اینترنت قطع است؛ ${localStorageMessage()}` });
      return;
    }
    checking.current = true;
    const controller = new AbortController();
    activeCheck.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const session = await ensureWorkerSession();
      if (id !== epoch.current || isLocalOnlyMode()) return;
      const token = tokenProvider() ?? session?.token;
      if (!token) {
        setState({ kind: 'blocked', message: `برای همگام‌سازی امن با سرور، از دکمهٔ Google وارد شو. ${localStorageMessage()}` });
        return;
      }
      await flushPendingDraft();
      if (id !== epoch.current || isLocalOnlyMode()) return;
      if (!getAuthenticatedServerStorage()) await onAuthenticated(token);
      if (id !== epoch.current || isLocalOnlyMode()) return;
      await getAuthenticatedServerStorage()?.flush();
      if (id !== epoch.current || isLocalOnlyMode()) return;
      await verifyOwnerServerConnection(token, controller.signal);
      if (id === epoch.current) setState({ kind: 'online', message: '' });
    } catch (problem) {
      if (id === epoch.current) {
        const message = problem instanceof Error && problem.name !== 'AbortError'
          ? problem.message
          : 'پاسخ سرور در زمان مجاز دریافت نشد.';
        setState({ kind: 'blocked', message: `همگام‌سازی سرور موقتاً برقرار نیست: ${message} ${localStorageMessage()}` });
      }
    } finally {
      checking.current = false;
      window.clearTimeout(timeout);
      if (activeCheck.current === controller) activeCheck.current = null;
      if (rerunAfterCheck.current) {
        rerunAfterCheck.current = false;
        if (mounted.current) void check();
      }
    }
  }, [tokenProvider, onAuthenticated, flushPendingDraft]);

  useEffect(() => {
    mounted.current = true;
    const handleResetStateChange = () => {
      const pending = isLocalOnlyMode();
      setResetPending(pending);
      if (pending) {
        epoch.current += 1;
        activeCheck.current?.abort();
        setState({ kind: 'blocked', message: 'حالت محلی فعال است؛ پاسخ‌ها روی همین دستگاه ذخیره می‌شوند و پس از تأیید سرور همگام خواهند شد.' });
      }
      else if (mounted.current) void check();
    };
    const handleQuarantineCount = (event: Event) => {
      const count = (event as CustomEvent<number>).detail;
      if (Number.isSafeInteger(count) && count >= 0) setQuarantinedCount(count);
    };
    void readQuarantineCount().then(setQuarantinedCount).catch(() => {});
    window.addEventListener(LOCAL_RESET_STATE_CHANGED_EVENT, handleResetStateChange);
    window.addEventListener('math-scratchpad:learning-quarantine-changed', handleQuarantineCount);
    const handleOnline = () => { void check(); };
    const handleStorageError = (event: Event) => {
      epoch.current += 1;
      const message = (event as CustomEvent<string>).detail;
      setState({
        kind: 'blocked',
        message: `همگام‌سازی سرور ناموفق بود: ${message || 'خطای ارتباط'}. تمرین‌ها روی این دستگاه ذخیره می‌شوند.`,
      });
    };
    window.addEventListener('offline', handleOnline);
    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleOnline);
    window.addEventListener('math-scratchpad:storage-error', handleStorageError);
    document.addEventListener('visibilitychange', handleOnline);
    const interval = window.setInterval(() => { void check(); }, PING_INTERVAL_MS);
    void check();
    return () => {
      mounted.current = false;
      epoch.current += 1;
      activeCheck.current?.abort();
      window.clearInterval(interval);
      window.removeEventListener('offline', handleOnline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleOnline);
      window.removeEventListener('math-scratchpad:storage-error', handleStorageError);
      document.removeEventListener('visibilitychange', handleOnline);
      window.removeEventListener(LOCAL_RESET_STATE_CHANGED_EVENT, handleResetStateChange);
      window.removeEventListener('math-scratchpad:learning-quarantine-changed', handleQuarantineCount);
    };
  }, [check]);

  return (
    <ServerConnectionOverlayContext.Provider value={setOverlayOpen}>
      <div data-server-editor data-connection-state={resetPending ? 'local' : state.kind}>
        {children}
      </div>
      {(state.kind !== 'online' || resetPending) && (!overlayOpen || resetPending) && (
        <aside role="status" aria-live="polite" aria-label="وضعیت همگام‌سازی" className="server-connection-gate" dir="rtl">
          <div className="server-connection-gate-header">
            <strong>{resetPending ? 'حالت محلی فعال است' : state.kind === 'checking' ? 'در حال همگام‌سازی' : 'ذخیرهٔ محلی فعال است'}</strong>
            {!resetPending && <button type="button" aria-label="بررسی دوباره اتصال" onClick={() => { void check(); }}>بررسی اتصال</button>}
          </div>
          <p className="server-connection-gate-message">{resetPending
            ? 'پاسخ‌ها روی همین دستگاه ذخیره می‌شوند و پس از تأیید سرور همگام خواهند شد.'
            : state.message}</p>
          {quarantinedCount > 0 && <p className="server-connection-gate-message">{quarantinedCount} رویداد قدیمی در قرنطینه نگه داشته شده‌اند و حذف نشده‌اند.</p>}
          {!resetPending && <div className="server-connection-gate-google">
            <GoogleLoginButton onComplete={() => check()} />
          </div>}
        </aside>
      )}
    </ServerConnectionOverlayContext.Provider>
  );
}
