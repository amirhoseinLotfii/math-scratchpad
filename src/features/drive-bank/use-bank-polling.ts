import { useEffect } from 'react';

export const POLL_MS = 30000;
export function useBankPolling(enabled: boolean, sync: () => Promise<void>) {
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [enabled]);
}
