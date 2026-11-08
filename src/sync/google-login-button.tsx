import { useEffect, useState, type Ref } from 'react';
import { Button } from '../shared/ui/button';
import { prepareGoogleIdClient } from './google-id-token';
import { requestCombinedGoogleAuth, type GoogleAuthCredentials } from './google-auth';

export function GoogleLoginButton({
  label = 'ورود یکپارچهٔ Google و Drive',
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
  buttonRef?: Ref<HTMLButtonElement>;
  onComplete?: (credentials: GoogleAuthCredentials) => void | Promise<void>;
}) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void prepareGoogleIdClient().then(() => {
      if (active) setReady(true);
    }).catch(problem => {
      if (active && showPrepareError) setError(problem instanceof Error ? problem.message : 'Google sign-in is unavailable.');
    });
    return () => { active = false; };
  }, [showPrepareError]);

  async function connect() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const credentials = await requestCombinedGoogleAuth();
      await onComplete?.(credentials);
      setMessage('Google account and Drive are connected.');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Google sign-in could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="google-login-control">
    <Button ref={buttonRef} className={className} disabled={disabled || busy || !ready} onClick={() => { void connect(); }}>
      {busy ? 'در حال اتصال به Google و Drive…' : label}
    </Button>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
  </div>;
}
