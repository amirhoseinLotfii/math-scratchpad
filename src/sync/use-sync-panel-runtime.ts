import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { subscribeApiToken } from './worker-session';
import { signOutGoogle } from './google-auth';
import { getDefaultSyncRuntime } from './runtime';
import { queueLearnEvent } from './browser-db';
import { emitTestLearnEvent } from './events';

const EMPTY_SYNC_STATUS = { phase: 'idle' as const, pending: 0, quarantined: 0, driveMirror: null, notionMirror: null };

export type SyncPanelFeedback = {
  setBusy: (busy: boolean) => void;
  setError: (error: string) => void;
  setMessage: (message: string) => void;
};
export function useSyncPanelRuntime({ setBusy, setError, setMessage }: SyncPanelFeedback) {
  const runtime = getDefaultSyncRuntime();
  const status = useSyncExternalStore(
    runtime?.subscribe ?? (() => () => undefined),
    runtime?.getSnapshot ?? (() => EMPTY_SYNC_STATUS),
    () => EMPTY_SYNC_STATUS,
  );
  useEffect(() => {
    if (!runtime) return;
    const stopObserving = runtime.observeMirrorStatuses();
    const timer = window.setInterval(() => {
      void runtime.refreshMirrorStatuses();
    }, 30_000);
    return () => {
      window.clearInterval(timer);
      stopObserving();
    };
  }, [runtime]);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void subscribeApiToken((token) => runtime?.setIdToken(token))
      .then((removeListener) => {
        if (!active) removeListener();
        else unsubscribe = removeListener;
      })
      .catch((problem) => {
        if (active) setError(problem instanceof Error ? problem.message : 'ورود گوگل بارگیری نشد.');
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [runtime]);

  const signOut = useCallback(async () => {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await signOutGoogle();
      runtime?.setIdToken(null);
      setMessage('از حساب خارج شدی؛ نشست سرور این دستگاه باطل شد. داده‌های این دستگاه محفوظ‌اند.');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'خروج انجام نشد.');
    } finally {
      setBusy(false);
    }
  }, [runtime]);

  const syncNow = useCallback(async () => {
    if (!runtime) {
      setError('سرویس صف آفلاین هنوز آماده نشده است.');
      return;
    }
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await runtime.syncAllNow();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'همگام‌سازی انجام نشد.');
    } finally {
      setBusy(false);
    }
  }, [runtime]);

  // Status reads are safe even when the server is still draining a large mirror backlog.
  // Unlike the integration test they never enqueue another learning event.
  const refreshMirrorHealth = useCallback(async () => {
    if (!runtime) {
      setError('موتور همگام‌سازی آماده نیست.');
      return;
    }
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await runtime.refreshMirrorStatuses();
      setMessage('وضعیت Drive و Notion دوباره از سرور دریافت شد. جزئیات خطاها را در بخش بالا ببین.');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'خواندن وضعیت سرویس‌ها ناموفق بود.');
    } finally {
      setBusy(false);
    }
  }, [runtime]);

  const sendSafeIntegrationTest = useCallback(async () => {
    if (
      !runtime ||
      status.phase !== 'synced' ||
      status.driveMirror?.status !== 'synced' ||
      status.notionMirror?.status !== 'synced' ||
      status.driveMirror.pendingCount > 0 ||
      status.notionMirror.pendingCount > 0
    ) {
      setError('برای ساخت رویداد آزمایشی، ابتدا ورود گوگل و همگام‌سازی هر دو آینه باید آماده و بدون صف باشد.');
      return;
    }
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const session = `sync-test-${crypto.randomUUID()}`;
      const event = emitTestLearnEvent(
        {
          bankVersion: 'sync-test-v1',
          session,
          chapter: 0,
          lesson: 'sync-verification',
          section: 'sync-verification',
          concept: 'sync-verification',
        },
        {
          type: 'check_answer',
          itemId: 'sync-verification',
          itemType: 'typed',
          questionText: 'Math Scratchpad integration verification (test only)',
          userAnswer: 'SYNC_TEST_ONLY',
          verdict: 'submitted',
          verdictSource: 'none',
          note: 'Synthetic owner-approved integration check; not a learner result.',
        },
      );
      await queueLearnEvent(event);
      await runtime.syncAllNow();
      const latest = runtime.getSnapshot();
      if (
        latest.driveMirror?.status === 'synced' &&
        latest.notionMirror?.status === 'synced' &&
        latest.driveMirror.pendingCount === 0 &&
        latest.notionMirror.pendingCount === 0
      ) {
        setMessage(
          `رویداد آزمایشی ${event.id} با isTest=true ارسال شد؛ در Notion باید Data Mode = Test باشد. این رویداد در پیشرفت واقعی محاسبه نمی‌شود.`,
        );
      } else {
        setMessage(
          `رویداد آزمایشی ${event.id} با isTest=true در صف قرار گرفت؛ آینه‌ها هنوز کامل نشده‌اند. از وضعیت بالا پیگیری کن و فعلاً رویداد دیگری نساز.`,
        );
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'ساخت یا ارسال رویداد آزمایشی ناموفق بود.');
    } finally {
      setBusy(false);
    }
  }, [runtime, status]);

  return { status, signOut, syncNow, refreshMirrorHealth, sendSafeIntegrationTest };
}
