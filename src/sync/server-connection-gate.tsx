import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { getAuthenticatedServerStorage, isLocalLearningResetPending } from './browser-db';
import { ensureApiToken, subscribeApiToken } from './worker-session';
import { GoogleLoginButton } from './google-login-button';
import { verifyOwnerServerConnection } from './server-storage';

type GateState = { kind: 'checking' | 'online' | 'blocked'; message: string };
const INITIAL: GateState = { kind: 'checking', message: 'در حال بررسی همگام‌سازی…' };
const TIMEOUT_MS = 7_000;
const PING_INTERVAL_MS = 30_000;

export const ServerConnectionOverlayContext = createContext<(open: boolean) => void>(() => {});

function localStorageMessage(): string {
  return 'تمرین‌ها روی این دستگاه ذخیره می‌شوند.';
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
  const checking = useRef(false);
  const rerunAfterCheck = useRef(false);
  const mounted = useRef(false);
  const epoch = useRef(0);

  const check = useCallback(async () => {
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
    let token = tokenProvider();
    if (!token) token = await ensureApiToken();
    if (!token) {
      setState({ kind: 'blocked', message: `برای همگام‌سازی با سرور وارد Google شو. ${localStorageMessage()}` });
      return;
    }
    checking.current = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      await flushPendingDraft();
      if (!getAuthenticatedServerStorage()) await onAuthenticated(token);
      await getAuthenticatedServerStorage()?.flush();
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
      if (rerunAfterCheck.current) {
        rerunAfterCheck.current = false;
        if (mounted.current) void check();
      }
    }
  }, [tokenProvider, onAuthenticated, flushPendingDraft]);

  useEffect(() => {
    mounted.current = true;
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
      window.clearInterval(interval);
      window.removeEventListener('offline', handleOnline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleOnline);
      window.removeEventListener('math-scratchpad:storage-error', handleStorageError);
      document.removeEventListener('visibilitychange', handleOnline);
    };
  }, [check]);

  useEffect(() => {
    if (state.kind === 'online') return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void subscribeApiToken(token => {
      if (!active) return;
      void onAuthenticated(token).then(check).catch(problem => {
        if (!active) return;
        setState({
          kind: 'blocked',
          message: `اتصال Google تأیید نشد: ${problem instanceof Error ? problem.message : 'خطای نامشخص'}. ${localStorageMessage()}`,
        });
      });
    }).then(removeListener => {
      if (!active) removeListener();
      else unsubscribe = removeListener;
    }).catch(problem => {
      if (active) setState({
        kind: 'blocked',
        message: `ورود گوگل بارگیری نشد: ${problem instanceof Error ? problem.message : 'خطای نامشخص'}. ${localStorageMessage()}`,
      });
    });
    return () => { active = false; unsubscribe?.(); };
  }, [state.kind, onAuthenticated, check]);

  const resetPending = isLocalLearningResetPending();

  return (
    <ServerConnectionOverlayContext.Provider value={setOverlayOpen}>
      <div data-server-editor data-connection-state={state.kind} inert={resetPending}>
        {children}
      </div>
      {(state.kind !== 'online' || resetPending) && (!overlayOpen || resetPending) && (
        <aside role="status" aria-live="polite" aria-label="وضعیت همگام‌سازی" className="server-connection-gate" dir="rtl">
          <div className="server-connection-gate-header">
            <strong>{resetPending ? 'پاک‌سازی داده‌های قبلی در حال انتظار است' : state.kind === 'checking' ? 'در حال همگام‌سازی' : 'ذخیرهٔ محلی فعال است'}</strong>
            <button type="button" aria-label="بررسی دوباره اتصال" onClick={() => { void check(); }}>بررسی اتصال</button>
          </div>
          <p className="server-connection-gate-message">{resetPending
            ? `تا تأیید پاک‌شدن داده‌های ابر، پاسخ‌دادن در این مرورگر قفل است. ${state.message}`
            : state.message}</p>
          <div className="server-connection-gate-google">
            <GoogleLoginButton />
          </div>
        </aside>
      )}
    </ServerConnectionOverlayContext.Provider>
  );
}
