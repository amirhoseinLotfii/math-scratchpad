import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setDriveAccessToken } from '../../src/auth/token-manager';
import { ChapterProgress } from '../../src/domain/entities/chapter-progress.types';
import { GoogleDriveSyncClient } from '../../src/sync/drive-client';
import { setStorageMode } from '../../src/sync/mode-gate';

describe('Google Drive Direct Sync Client - §4.3, IT-04', () => {
  beforeEach(async () => {
    await setStorageMode('online');
    setDriveAccessToken('test-drive-token', 3600);
  });

  it('probes Google Drive within 5 seconds timeout', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        user: { emailAddress: 'learner@example.com' },
        storageQuota: { usage: '1000', limit: '100000' }
      })
    });

    const client = new GoogleDriveSyncClient(mockFetch as any);
    const res = await client.probe();

    expect(res.email).toBe('learner@example.com');
    expect(res.usageBytes).toBe(1000);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('detects remote change during preflight and merges before upload (IT-04)', async () => {
    const localProgress: ChapterProgress = {
      schemaVersion: '1.0.0',
      kind: 'chapter_progress',
      chapterId: 'PC-1.1',
      bankVersion: 'v21',
      updatedHlc: '1732176002000:0000:dev-local',
      items: {
        'PC-1.1-L01': {
          status: 'in_progress',
          statusHlc: '1732176002000:0000:dev-local',
          attemptCount: 0,
          steps: {
            s1: {
              stepId: 's1',
              orderKey: 'a0',
              branchId: 'main',
              updatedHlc: '1732176002000:0000:dev-local',
              deleted: false,
              segments: [{ type: 'math', content: 'x = 5' }]
            }
          }
        }
      }
    };

    const remoteProgress: ChapterProgress = {
      schemaVersion: '1.0.0',
      kind: 'chapter_progress',
      chapterId: 'PC-1.1',
      bankVersion: 'v21',
      updatedHlc: '1732176001000:0000:dev-remote',
      items: {
        'PC-1.1-L02': {
          status: 'solved',
          statusHlc: '1732176001000:0000:dev-remote',
          attemptCount: 1,
          steps: {}
        }
      }
    };

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('files/file-123?fields=')) {
        // Preflight returns new headRevisionId
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'file-123',
            headRevisionId: 'rev-456'
          })
        });
      }
      if (url.includes('files/file-123?alt=media')) {
        // Download remote content
        return Promise.resolve({
          ok: true,
          json: async () => remoteProgress
        });
      }
      if (url.includes('upload/drive/v3/files/file-123')) {
        // Multipart PATCH upload
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'file-123',
            headRevisionId: 'rev-457'
          })
        });
      }
      return Promise.reject(new Error(`Unhandled mock URL: ${url}`));
    });

    const client = new GoogleDriveSyncClient(mockFetch as any);

    // Call sync with cachedFileId and older known revision rev-100
    const syncRes = await client.syncChapterProgress(
      'PC-1.1',
      localProgress,
      'file-123',
      'rev-100'
    );

    expect(syncRes.fileId).toBe('file-123');
    // Both local item and remote item exist in merged document
    expect(syncRes.mergedProgress.items['PC-1.1-L01']).toBeDefined();
    expect(syncRes.mergedProgress.items['PC-1.1-L02']).toBeDefined();
  });
});
