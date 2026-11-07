import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { getAuthenticatedServerStorage } from './browser-db';
import { mountGoogleIdButton } from './google-id-token';
import { verifyOwnerServerConnection } from './server-storage';

type GateState = { kind: 'checking' | 'online' | 'blocked'; message: string };
const INITIAL: GateState = { kind: 'checking', message: 'در حال بررسی همگام‌سازی…' };
const TIMEOUT_MS = 7_000;
const PING_INTERVAL_MS = 30_000;

/** Keeps the editor usable from durable local data while the server is unavailable. */
export function ServerConnectionGate({ children, tokenProvider, onAuthenticated, flushPendingDraft }: {
  children: ReactNode;
  tokenProvider: () => string | undefined;
  onAuthenticated: (token: string) => Promise<void>;
  flushPendingDraft: () => Promise<void>;
}) {
  const [state, setState] = useState<GateState>(INITIAL);
  const checking = useRef(false);
  const rerunAfterCheck = useRef(false);
  const mounted = useRef(false);
  const epoch = useRef(0);
  const retryButton = useRef<HTMLDivElement>(null);

  const check = useCallback(async () => {
    if (checking.current) {
      // StrictMode and visibility events can request another check while auth restores.
      // Queue one follow-up so the in-flight request cannot leave the gate stuck checking.
      rerunAfterCheck.current = true;
      return;
    }
    const id = ++epoch.current;
    if (navigator.onLine === false) {
      setState({ kind: 'blocked', message: 'اینترنت قطع است؛ تمرین‌ها همچنان روی این دستگاه ذخیره می‌شوند.' });
      return;
    }
    const token = tokenProvider();
    if (!token) {
      setState({ kind: 'blocked', message: 'برای همگام‌سازی با سرور وارد Google شو. تمرین‌ها روی این دستگاه ذخیره می‌شوند.' });
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
        setState({ kind: 'blocked', message: `همگام‌سازی سرور موقتاً برقرار نیست: ${message} داده‌های این دستگاه محفوظ‌اند.` });
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
    if (state.kind === 'online' || !retryButton.current) return;
    let active = true;
    const element = retryButton.current;
    let unsubscribe: (() => void) | undefined;
    void mountGoogleIdButton(element, token => {
      if (!active) return;
      void onAuthenticated(token).then(check).catch(problem => {
        if (!active) return;
        setState({
          kind: 'blocked',
          message: `اتصال Google تأیید نشد: ${problem instanceof Error ? problem.message : 'خطای نامشخص'}. داده‌های این دستگاه محفوظ‌اند.`,
        });
      });
    }).then(removeListener => {
      if (!active) removeListener();
      else unsubscribe = removeListener;
    }).catch(() => { /* The explicit retry action remains available. */ });
    return () => { active = false; unsubscribe?.(); element.replaceChildren(); };
  }, [state.kind, onAuthenticated, check]);

  return (
    <>
      <div data-server-editor data-connection-state={state.kind} style={{ display: 'contents' }}>
        {children}
      </div>
      {state.kind !== 'online' && (
        <aside role="status" aria-live="polite" aria-label="وضعیت همگام‌سازی" className="server-connection-gate" dir="rtl" style={{
          // The authentication banner must stay in normal document flow:
          // fixed overlays previously intercepted math controls and dialogs.
          position: 'relative', margin: '12px 12px 18px auto',
          width: 'min(440px, calc(100% - 24px))', padding: 12, borderRadius: 14,
          background: 'rgba(32, 35, 38, .97)', color: '#F0F3F1',
          border: '1px solid #536259', boxShadow: '0 8px 30px rgba(0,0,0,.35)',
          fontFamily: 'system-ui, sans-serif', lineHeight: 1.5, textAlign: 'right',
          pointerEvents: 'auto',
        }}>
          <div className="server-connection-gate-header">
            <strong>{state.kind === 'checking' ? 'در حال همگام‌سازی' : 'ذخیرهٔ محلی فعال است'}</strong>
            <button type="button" aria-label="بررسی دوباره اتصال" onClick={() => { void check(); }} style={{
              background: '#86B99B', color: '#101A14', border: 0, borderRadius: 10,
              minHeight: 44, padding: '8px 10px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
              pointerEvents: 'auto',
            }}>بررسی اتصال</button>
          </div>
          <p className="server-connection-gate-message" style={{ margin: '8px 0 0', fontSize: 13 }}>{state.message}</p>
          <div ref={retryButton} className="server-connection-gate-google" style={{ marginTop: 8, display: 'flex', justifyContent: 'center', direction: 'ltr', pointerEvents: 'auto' }} />
        </aside>
      )}
    </>
  );
}
