import { describe, expect, it, vi } from 'vitest';
import { LegacyDriveMigrator, CandidateFile } from '../../src/sync/legacy-drive-migrator';
import { GoogleDriveSyncClient } from '../../src/sync/drive-client';

describe('5-Step Non-Destructive Legacy Drive Migrator - §4.3, E2E-11', () => {
  it('correctly identifies messy hashed legacy filenames', () => {
    const migrator = new LegacyDriveMigrator({} as any);

    expect(migrator.isLegacyCandidate('editor_state.sha256-a1b2c3d4e5f67890.json')).toBe(true);
    expect(migrator.isLegacyCandidate('progress.json')).toBe(true);
    expect(migrator.isLegacyCandidate('sync_manifest.json')).toBe(true);
    expect(migrator.isLegacyCandidate('events_2026-11.jsonl')).toBe(true);

    // Regular clean target names should not be treated as legacy candidates
    expect(migrator.isLegacyCandidate('PC-1.1.json')).toBe(false);
    expect(migrator.isLegacyCandidate('MATH_QUESTION_BANK.json')).toBe(false);
  });

  it('halts immediately if step 2 backup copy fails (§4.3)', async () => {
    const mockDrive = { downloadJson: vi.fn() } as unknown as GoogleDriveSyncClient;
    const migrator = new LegacyDriveMigrator(mockDrive);

    const candidates: CandidateFile[] = [
      { id: 'file-1', name: 'editor_state.sha256-1111.json' }
    ];

    const mockApiClient = {
      copyFile: vi.fn().mockRejectedValue(new Error('Drive storage quota exceeded')),
      moveFile: vi.fn()
    };

    const report = await migrator.executeMigration(
      candidates,
      {
        backupFolderId: 'folder-backup',
        archiveFolderId: 'folder-archive',
        progressFolderId: 'folder-progress'
      },
      mockApiClient
    );

    expect(report.status).toBe('aborted');
    expect(report.error).toContain('Drive storage quota exceeded');
    expect(report.filesBackedUp).toBe(0);
    // Crucial: no move occurred
    expect(mockApiClient.moveFile).not.toHaveBeenCalled();
  });

  it('performs non-destructive migration and moves originals to archive without deleting (E2E-11)', async () => {
    const legacyPayload = {
      format: 'math-scratchpad-server-state/v1',
      records: [
        {
          key: 'math-scratchpad-session-v3',
          value: JSON.stringify({
            doc: {
              session: { bankId: 'PC-1.1', bankVersion: 'v21' },
              exercises: []
            }
          })
        }
      ]
    };

    const mockDrive = {
      downloadJson: vi.fn().mockResolvedValue(legacyPayload)
    } as unknown as GoogleDriveSyncClient;

    const migrator = new LegacyDriveMigrator(mockDrive);

    const candidates: CandidateFile[] = [
      { id: 'file-1', name: 'editor_state.sha256-1111.json', parents: ['old-root'] },
      { id: 'file-2', name: 'progress.json', parents: ['old-root'] }
    ];

    const copySpy = vi.fn().mockImplementation((id, parent) => Promise.resolve({ id: `backup-${id}` }));
    const moveSpy = vi.fn().mockResolvedValue(undefined);

    const report = await migrator.executeMigration(
      candidates,
      {
        backupFolderId: 'folder-backup',
        archiveFolderId: 'folder-archive',
        progressFolderId: 'folder-progress'
      },
      { copyFile: copySpy, moveFile: moveSpy }
    );

    expect(report.status).toBe('completed');
    expect(report.filesBackedUp).toBe(2);
    expect(report.filesArchived).toBe(2);

    // Verify copies were made
    expect(copySpy).toHaveBeenCalledTimes(2);

    // Verify originals were moved to archive folder (NEVER deleted)
    expect(moveSpy).toHaveBeenCalledWith('file-1', 'folder-archive', 'old-root');
    expect(moveSpy).toHaveBeenCalledWith('file-2', 'folder-archive', 'old-root');
  });
});
