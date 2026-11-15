import { LEARNING_RESET_EPOCH_HEADER } from '../../../shared/contracts/reset-epoch';
import type { GoogleDriveClient } from '../google-drive';
import type { NotionMirrorStatus } from '../notion-mirror';
import { readBank, registerBankSource } from './bank-source-service';
import type { DriveMirrorStatus } from './drive-mirror-state';
import { readPage } from './event-repository';
import { json } from './response';
import { learningResetClientStatus, learningResetStatus } from './reset-service';
import { resetPreview, type ScopedResetDependencies } from './scoped-reset-preview';
import { executeScopedReset } from './scoped-reset-service';
import { handleSession } from './session-service';
import { readAppState } from './state-repository';

type EventStoreRouterPorts = {
  storage: DurableObjectStorage;
  activeLearningResetId?: string;
  executeLearningReset: (request: Request) => Promise<Response>;
  releaseLearningReset: (request: Request) => Promise<Response>;
  learningResetEpoch: () => Response;
  isLearningResetLocked: () => boolean;
  isLearningOrMirrorRoute: (path: string, method: string) => boolean;
  requiredLearningClientEpoch: () => string | null;
  consumeRateLimit: () => Response | null;
  bankDriveClient: () => GoogleDriveClient;
  withMirrorSubrequestBudget: <T>(operation: () => Promise<T>) => Promise<{ value: T; used: number; limit: number }>;
  syncWeeklyBackup: (now: Date) => Promise<DriveMirrorStatus['weeklyBackup']>;
  syncDrive: () => Promise<DriveMirrorStatus>;
  syncNotion: () => Promise<NotionMirrorStatus>;
  recordDiagnostic: (destination: 'drive' | 'notion', stage: string, code: string) => void;
  getDriveStatus: () => Promise<DriveMirrorStatus>;
  getNotionStatus: () => Promise<NotionMirrorStatus>;
  scopedResetDependencies: () => ScopedResetDependencies;
  writeState: (request: Request) => Promise<Response>;
  appendEvents: (request: Request) => Promise<Response>;
};

export async function routeStoreRequest(request: Request, ports: EventStoreRouterPorts): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/internal/learning-reset') return ports.executeLearningReset(request);
  if (request.method === 'POST' && url.pathname === '/internal/learning-reset/release') return ports.releaseLearningReset(request);
  if (request.method === 'GET' && url.pathname === '/internal/learning-reset/status')
    return learningResetStatus(ports.storage, ports.activeLearningResetId !== undefined);
  if (request.method === 'GET' && url.pathname === '/internal/learning-reset/client-status')
    return learningResetClientStatus(ports.storage, () => ports.consumeRateLimit());
  if (request.method === 'GET' && url.pathname === '/internal/learning-reset/epoch') return ports.learningResetEpoch();
  if (ports.isLearningResetLocked() && ports.isLearningOrMirrorRoute(url.pathname, request.method)) {
    return json({ error: 'learning_reset_in_progress' }, 503, { 'Retry-After': '10' });
  }
  if (request.method === 'POST' && ['/events', '/state'].includes(url.pathname)) {
    const requiredEpoch = ports.requiredLearningClientEpoch();
    if (requiredEpoch && request.headers.get(LEARNING_RESET_EPOCH_HEADER) !== requiredEpoch) {
      return json({ error: 'client_update_required', requiredEpoch }, 426);
    }
  }
  if (request.method === 'POST' && url.pathname.startsWith('/internal/session/'))
    return handleSession(ports.storage, () => ports.consumeRateLimit(), url.pathname, request);
  if (
    (request.method === 'GET' && (url.pathname === '/bank/meta' || url.pathname === '/bank/content')) ||
    (request.method === 'POST' && url.pathname === '/bank/source')
  ) {
    const rate = ports.consumeRateLimit();
    if (rate) return rate;
    if (url.pathname === '/bank/source') return registerBankSource(ports.storage, () => ports.bankDriveClient(), request);
    return readBank(ports.storage, () => ports.bankDriveClient(), url.pathname === '/bank/content');
  }
  const supported =
    (request.method === 'POST' && (url.pathname === '/events' || url.pathname === '/reset/execute')) ||
    (request.method === 'GET' &&
      (url.pathname === '/sync' ||
        url.pathname === '/snapshot' ||
        url.pathname === '/drive/status' ||
        url.pathname === '/notion/status' ||
        url.pathname === '/state' ||
        url.pathname === '/reset/preview')) ||
    (request.method === 'POST' &&
      (url.pathname === '/drive/sync' ||
        url.pathname === '/notion/sync' ||
        url.pathname === '/internal/weekly-backup' ||
        url.pathname === '/state' ||
        url.pathname === '/internal/sync-all'));
  if (!supported) return json({ error: 'not_found' }, 404);

  if (url.pathname === '/internal/weekly-backup') {
    const scheduledTime = Number(url.searchParams.get('scheduledTime'));
    const now = Number.isSafeInteger(scheduledTime) && scheduledTime > 0 ? new Date(scheduledTime) : new Date();
    const result = await ports.withMirrorSubrequestBudget(() => ports.syncWeeklyBackup(now));
    return json({ weeklyBackup: result.value, subrequestsUsed: result.used, subrequestLimit: result.limit });
  }

  if (url.pathname === '/internal/sync-all') {
    const result = await ports.withMirrorSubrequestBudget(async () => {
      const [driveResult, notionResult] = await Promise.allSettled([ports.syncDrive(), ports.syncNotion()]);
      const drive =
        driveResult.status === 'fulfilled'
          ? driveResult.value
          : {
              status: 'error' as const,
              lastSyncedAt: null,
              pendingCount: 0,
              quarantinedCount: null,
              lastError: 'network_error' as const,
              failureStage: 'sync_all',
              weeklyBackup: { status: 'scheduled' as const, lastCreatedAt: null, lastError: null },
            };
      const notion =
        notionResult.status === 'fulfilled'
          ? notionResult.value
          : {
              status: 'error' as const,
              lastSyncedAt: null,
              pendingCount: 0,
              quarantinedCount: null,
              lastError: 'network_error' as const,
            };
      if (driveResult.status === 'rejected') ports.recordDiagnostic('drive', 'sync_all', 'network_error');
      if (notionResult.status === 'rejected') ports.recordDiagnostic('notion', 'sync_all', 'network_error');
      return { drive, notion };
    });
    return json({ ...result.value, subrequestsUsed: result.used, subrequestLimit: result.limit });
  }
  const rate = ports.consumeRateLimit();
  if (rate) return rate;

  if (url.pathname === '/reset/preview') return resetPreview(ports.scopedResetDependencies(), url);
  if (request.method === 'POST' && url.pathname === '/reset/execute') return executeScopedReset(ports.scopedResetDependencies(), request);
  if (url.pathname === '/state') {
    return request.method === 'GET' ? readAppState(ports.storage) : ports.writeState(request);
  }
  if (url.pathname === '/events') return ports.appendEvents(request);
  if (url.pathname === '/drive/status') return json(await ports.getDriveStatus());
  if (url.pathname === '/notion/status') return json(await ports.getNotionStatus());
  if (url.pathname === '/drive/sync') {
    const status = await ports.syncDrive();
    const ok = status.status === 'synced' || (status.status === 'pending' && status.pendingCount === 0);
    return json({ drive: status }, ok ? 200 : status.status === 'not_configured' ? 503 : 502);
  }
  if (url.pathname === '/notion/sync') {
    const status = await ports.syncNotion();
    return json(
      { notion: status },
      status.status === 'synced' ? 200 : status.status === 'not_configured' ? 503 : status.status === 'pending' ? 202 : 502,
    );
  }
  return readPage(ports.storage, url, url.pathname === '/snapshot');
}
