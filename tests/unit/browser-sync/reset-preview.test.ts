import { describe, expect, it, vi } from 'vitest';
import { BrowserSyncRuntime } from '../../../src/sync/runtime';
import { withIdleResetStatus } from '../../helpers/browser-sync';
describe('owner-only read-only cloud reset preview', () => {
  const payload = {
    readOnly: true,
    canExecute: false,
    scope: 'all',
    matchingEvents: 3,
    totalEvents: 3,
    lastSeq: 3,
    appStateRevision: 2,
    protectedBankAndIdentityStateKeys: 1,
    sharedStateKeysRequiringSelectiveMerge: 1,
    notionPageReferencesRequiringReconciliation: 2,
    requiresCloudReconciliation: true,
    warning: 'Preview only.',
  };
  it('requires a Google identity token and never sends an anonymous deletion request', async () => {
    const fetcher = vi.fn(async () => Response.json(payload));
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    await expect(runtime.previewAllReset()).rejects.toThrow('Google sign-in is required');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('issues exactly one authenticated GET and displays a valid preflight', async () => {
    const fetcher = vi.fn(async () => Response.json(payload));
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher: withIdleResetStatus(fetcher) });
    expect(await runtime.previewAllReset('owner-test-token')).toMatchObject(payload);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      'https://sync.example/reset/preview?scope=all',
      expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer owner-test-token' } }),
    );
  });
  it('rejects invalid preview payloads without claiming any deletion', async () => {
    const fetcher = vi.fn(async () => Response.json({ scope: 'all', canExecute: true }));
    const runtime = new BrowserSyncRuntime({ apiOrigin: 'https://sync.example', fetcher });
    await expect(runtime.previewAllReset('owner-test-token')).rejects.toThrow('پاسخ پیش‌نمایش ریست معتبر نبود');
  });
});
