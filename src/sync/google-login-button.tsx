import { useEffect, useRef, useState, type Ref } from 'react';
import { Button } from '../shared/ui/button';
import { GoogleAuthError, googleAuthFailureMessage } from './google-auth-errors';
import { getGoogleAuthDiagnostics, subscribeGoogleAuthDiagnostics } from './google-auth-diagnostics';
import { establishGoogleIdentitySession, requestDriveAccessTokenFromGesture, type GoogleAuthCredentials } from './google-auth';
import { mountGoogleIdButton } from './google-id-token';
import type { Token } from '../features/drive-bank/google';
import { getWorkerSession, WORKER_SESSION_EVENT } from './worker-session';

function errorMessage(problem: unknown): string {
  if (problem instanceof GoogleAuthError) return problem.message;
  return problem instanceof Error ? problem.message : googleAuthFailureMessage('network_error');
}

function AuthDiagnosticsPanel() {
  const [entries, setEntries] = useState(getGoogleAuthDiagnostics);
  useEffect(() => subscribeGoogleAuthDiagnostics(() => setEntries(getGoogleAuthDiagnostics())), []);
  if (new URLSearchParams(window.location.search).get('debug') !== 'auth') return null;
  return (
    <details className="mt-2 rounded border border-white/20 p-2 text-xs" dir="ltr">
      <summary className="cursor-pointer">Auth diagnostics (tokens and account data are omitted)</summary>
      <ol className="mt-2 max-h-48 list-decimal overflow-auto ps-5">
        {entries.slice(-20).map((entry, index) => (
          <li key={`${entry.at}-${index}`}>
            <time dateTime={entry.at}>{entry.at}</time> — {entry.event}
            {entry.detail ? `: ${entry.detail}` : ''}
          </li>
        ))}
        {!entries.length && <li>No auth events recorded yet.</li>}
      </ol>
    </details>
  );
}

/** Google Identity Services renders this official, explicit ID-token button. */
export function GoogleLoginButton({
  label = 'ورود با حساب Google',
  className,
  disabled = false,
  showPrepareError = true,
  buttonRef,
  onComplete,
}: {
  label?: string;
  className?: string;
  disabled?: boolean;
  showPrepareError?: boolean;
  buttonRef?: Ref<HTMLDivElement>;
  onComplete?: (credentials: GoogleAuthCredentials) => void | Promise<void>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let active = true;
    let preparing = false;
    let mounted = false;
    let retryAfterLoad = false;
    let unmount: (() => void) | undefined;
    const element = container.current;
    if (!element) return;
    const onCredential = (token: string) => {
      setError('');
      setMessage('');
      setBusy(true);
      void establishGoogleIdentitySession(token)
        .then(async (credentials) => {
          if (!active) return;
          await onCompleteRef.current?.(credentials);
          setMessage('نشست Google در سرور تأیید شد.');
        })
        .catch((problem) => {
          if (active && showPrepareError) setError(errorMessage(problem));
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    };
    const prepare = async () => {
      if (!active || !navigator.onLine) {
        setOnline(false);
        setReady(false);
        return;
      }
      setOnline(true);
      if (mounted) return;
      if (preparing) {
        retryAfterLoad = true;
        return;
      }
      preparing = true;
      try {
        const remove = await mountGoogleIdButton(element, onCredential);
        if (!active || !navigator.onLine) {
          remove();
          element.replaceChildren();
          return;
        }
        unmount = remove;
        mounted = true;
        setReady(true);
        setError('');
      } catch (problem) {
        if (active && showPrepareError)
          setError(problem instanceof GoogleAuthError ? problem.message : googleAuthFailureMessage('prompt_unavailable'));
      } finally {
        preparing = false;
        if (retryAfterLoad && active && navigator.onLine) {
          retryAfterLoad = false;
          void prepare();
        }
      }
    };
    const onOnline = () => void prepare();
    const onOffline = () => {
      setOnline(false);
      setReady(false);
      unmount?.();
      unmount = undefined;
      mounted = false;
      element.replaceChildren();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    void prepare();
    return () => {
      active = false;
      unmount?.();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [showPrepareError]);

  return (
    <div className={`google-login-control ${className ?? ''}`}>
      <p className="mb-2 text-sm">{label}</p>
      <div
        ref={(node) => {
          if (typeof buttonRef === 'function') buttonRef(node);
          else if (buttonRef) buttonRef.current = node;
          container.current = node;
        }}
        className="inline-flex min-h-11 min-w-48 items-center"
        tabIndex={-1}
        aria-label={label}
        aria-disabled={disabled || busy || !ready || !online}
        inert={disabled || busy || !ready || !online}
      />
      {!online && <p role="status">برای ورود با Google به اینترنت نیاز است.</p>}
      {busy && (
        <p role="status" aria-live="polite">
          در حال تأیید نشست Google در سرور…
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <AuthDiagnosticsPanel />
    </div>
  );
}

/** Separate Drive permission button; its OAuth popup starts in the click handler. */
export function GoogleDriveAccessButton({
  label = 'اجازهٔ جداگانهٔ Google Drive',
  disabled = false,
  onComplete,
}: {
  label?: string;
  disabled?: boolean;
  onComplete?: (token: Token) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [sessionReady, setSessionReady] = useState(() => !!getWorkerSession());

  useEffect(() => {
    const refresh = () => setSessionReady(!!getWorkerSession());
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener(WORKER_SESSION_EVENT, refresh);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    refresh();
    return () => {
      window.removeEventListener(WORKER_SESSION_EVENT, refresh);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  function connect(): void {
    if (!navigator.onLine) {
      setError('برای اتصال Google Drive به اینترنت نیاز است.');
      return;
    }
    setError('');
    setMessage('');
    let request: Promise<Token>;
    try {
      if (!navigator.onLine) throw new Error('برای اتصال Google Drive به اینترنت نیاز است.');
      // Keep this call synchronous in the click stack so Android Chrome retains user activation.
      request = requestDriveAccessTokenFromGesture();
    } catch (problem) {
      setError(errorMessage(problem));
      return;
    }
    setBusy(true);
    void request
      .then(async (token) => {
        await onComplete?.(token);
        setMessage('دسترسی Google Drive تأیید شد.');
      })
      .catch((problem) => setError(errorMessage(problem)))
      .finally(() => setBusy(false));
  }

  return (
    <div className="google-drive-access-control">
      <Button type="button" disabled={disabled || busy || !sessionReady || !online} onClick={connect}>
        {busy ? 'در حال اتصال به Drive…' : label}
      </Button>
      {!online && <p role="status">برای اتصال Google Drive به اینترنت نیاز است.</p>}
      {!sessionReady && <p className="text-xs">ابتدا ورود Google را کامل کن؛ دسترسی Drive بعد از تأیید نشست سرور فعال می‌شود.</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
