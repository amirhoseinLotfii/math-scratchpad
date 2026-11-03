import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { getAuthenticatedServerStorage, updateAuthenticatedServerToken } from './browser-db';
import { mountGoogleIdButton } from './google-id-token';
import { verifyOwnerServerConnection } from './server-storage';
import { getDefaultSyncRuntime } from './runtime';

type GateState = { kind: 'checking' | 'online' | 'blocked'; message: string };
const INITIAL: GateState = { kind: 'checking', message: 'در حال بررسی ارتباط امن با سرور…' };
const TIMEOUT_MS = 7_000;
const PING_INTERVAL_MS = 5_000;

/** No authenticated server acknowledgment means no editing. No browser fallback. */
export function ServerConnectionGate({ children, tokenProvider, flushPendingDraft }: {
  children: ReactNode;
  tokenProvider: () => string | undefined;
  flushPendingDraft: () => Promise<void>;
}) {
  const [state, setState] = useState<GateState>(INITIAL);
  const checking = useRef(false);
  const epoch = useRef(0);
  const retryButton = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

  const check = useCallback(async () => {
    const id = ++epoch.current;
    if (navigator.onLine === false) {
      setState({ kind: 'blocked', message: 'اتصال اینترنت قطع است. ویرایش تا اتصال مجدد غیرفعال می‌ماند.' });
      return;
    }
    const token = tokenProvider();
    if (!token) {
      setState({ kind: 'blocked', message: 'ورود Google لازم است. اتصال سرور تأیید نشده است.' });
      return;
    }
    if (checking.current) return;
    checking.current = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      // Flush the editor's debounce timer first, then await the server acknowledgment.
      // Otherwise reconnecting within the 180 ms autosave delay could unlock too early.
      await flushPendingDraft();
      await getAuthenticatedServerStorage()?.flush();
      await verifyOwnerServerConnection(token, controller.signal);
      if (id === epoch.current) {
        setState({ kind: 'online', message: '' });
      }
    } catch (problem) {
      if (id === epoch.current) {
        const message = problem instanceof Error && problem.name !== 'AbortError'
          ? problem.message
          : 'پاسخ سرور در زمان مجاز دریافت نشد.';
        setState({ kind: 'blocked', message: `ارتباط یا ذخیرهٔ امن تأیید نشد: ${message}` });
      }
    } finally {
      checking.current = false;
      window.clearTimeout(timeout);
    }
  }, [tokenProvider, flushPendingDraft]);

  useEffect(() => {
    const handleOffline = () => {
      epoch.current += 1;
      setState({ kind: 'blocked', message: 'اینترنت قطع شده است. تا تأیید مجدد سرور ویرایش متوقف می‌ماند.' });
    };
    const handleOnline = () => { void check(); };
    const handleStorageError = (event: Event) => {
      epoch.current += 1;
      const message = (event as CustomEvent<string>).detail;
      setState({ kind: 'blocked', message: `آخرین ذخیرهٔ سروری تأیید نشد: ${message || 'خطای ارتباط'}` });
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleOnline);
    window.addEventListener('math-scratchpad:storage-error', handleStorageError);
    document.addEventListener('visibilitychange', handleOnline);
    const interval = window.setInterval(() => { void check(); }, PING_INTERVAL_MS);
    void check();
    return () => {
      epoch.current += 1;
      window.clearInterval(interval);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleOnline);
      window.removeEventListener('math-scratchpad:storage-error', handleStorageError);
      document.removeEventListener('visibilitychange', handleOnline);
    };
  }, [check]);

  useEffect(() => {
    if (state.kind !== 'blocked' || !retryButton.current) return;
    let active = true;
    const element = retryButton.current;
    void mountGoogleIdButton(element, token => {
      if (!active) return;
      updateAuthenticatedServerToken(token);
      getDefaultSyncRuntime()?.setIdToken(token);
      void check();
    }).catch(() => { /* The normal Retry action still works for connectivity errors. */ });
    return () => { active = false; element.replaceChildren(); };
  }, [state.kind, check]);

  useEffect(() => {
    if (state.kind === 'online') return;
    // A few lesson-navigation shortcuts are attached to window rather than
    // the editor. Stop them in capture phase even when the editor is inert.
    const blockShortcut = (event: KeyboardEvent) => {
      if (event.altKey && (event.ctrlKey || event.metaKey)
        && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', blockShortcut, true);
    return () => window.removeEventListener('keydown', blockShortcut, true);
  }, [state.kind]);

  useEffect(() => {
    if (state.kind !== 'online') {
      // Remove focus from any editor control before making it inert.
      const active = document.activeElement;
      if (active instanceof HTMLElement && root.current?.contains(active)) active.blur();
    }
  }, [state.kind]);

  return (
    <>
      <div ref={root} data-server-editor data-connection-state={state.kind} inert={state.kind !== 'online'} style={{ display: 'contents' }}>
        {children}
      </div>
      {state.kind !== 'online' && (
        <div role="alertdialog" aria-modal="true" aria-label="ویرایش به‌دلیل قطع ارتباط با سرور متوقف شده"
          dir="rtl" style={{
            position: 'fixed', inset: 0, zIndex: 10000, display: 'grid', placeItems: 'center',
            padding: 20, background: 'rgba(9, 12, 14, .93)', color: '#F0F3F1',
          }}>
          <section style={{
            width: 'min(100%, 440px)', padding: 24, borderRadius: 16,
            background: '#202326', border: '1px solid #536259', textAlign: 'right',
            fontFamily: 'system-ui, sans-serif', lineHeight: 1.9,
          }}>
            <h2 style={{ fontSize: 20, margin: '0 0 10px' }}>ویرایش موقتاً متوقف است</h2>
            <p role="status" style={{ margin: '0 0 12px' }}>{state.message}</p>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: '#CFD8D2' }}>
              هیچ ویرایشی هنگام قطع اتصال مجاز نیست. اگر تغییری هنوز تأیید نشده، صفحه را نبند.
              بعد از تأیید سرور و ذخیرهٔ تغییرات، ویرایش خودکار فعال می‌شود.
            </p>
            <button type="button" onClick={() => { void check(); }} style={{
              background: '#86B99B', color: '#101A14', border: 0, borderRadius: 10,
              padding: '10px 18px', fontWeight: 600, fontSize: 16, cursor: 'pointer',
            }}>بررسی دوباره اتصال</button>
            <div ref={retryButton} style={{ marginTop: 16, display: 'flex', justifyContent: 'center', direction: 'ltr' }} />
          </section>
        </div>
      )}
    </>
  );
}
