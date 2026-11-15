import { useSyncExternalStore } from 'react';
import { Button } from '../shared/ui/button';

type InstallPrompt = Event & { prompt: () => Promise<unknown> };
let prompt: InstallPrompt | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
let started = false;

export function trackInstallPrompt() {
  if (started || !import.meta.env.PROD || typeof window.matchMedia !== 'function') return;
  started = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    if (!('prompt' in event) || typeof event.prompt !== 'function') return;
    event.preventDefault();
    prompt = event as InstallPrompt;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    prompt = undefined;
    notify();
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

function state() {
  if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) return '';
  const browsing = navigator as Navigator & { standalone?: boolean };
  if (browsing.standalone) return '';
  if (prompt) return 'install';
  return /iPad|iPhone|iPod/.test(browsing.userAgent) ? 'ios' : '';
}

export function InstallApp() {
  const hint = useSyncExternalStore(subscribe, state, () => '');
  if (hint === 'ios')
    return (
      <p lang="fa" dir="rtl">
        از منوی Share، گزینهٔ Add to Home Screen را بزن.
      </p>
    );
  if (hint !== 'install') return null;
  return (
    <Button
      lang="fa"
      onClick={() => {
        const current = prompt;
        prompt = undefined;
        notify();
        void current?.prompt().catch(() => undefined);
      }}
    >
      نصب برنامه
    </Button>
  );
}
