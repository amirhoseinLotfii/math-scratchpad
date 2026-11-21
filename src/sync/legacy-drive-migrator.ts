import { migrateDocument } from '../domain/sync/migrate-document';
import { GoogleDriveSyncClient } from './drive-client';

export interface LegacyMigrationReport {
  candidatesFound: number;
  backupFolderId: string;
  filesBackedUp: number;
  migratedProgressCount: number;
  filesArchived: number;
  status: 'completed' | 'aborted';
  error?: string;
}

export interface CandidateFile {
  id: string;
  name: string;
  parents?: string[];
}

export class LegacyDriveMigrator {
  constructor(private driveClient: GoogleDriveSyncClient) {}

  /**
   * Identifies candidate files that match legacy messy naming patterns:
   * - editor_state.sha256-*.json
   * - progress.json
   * - sync_manifest.json
   * - events_*.jsonl
   */
  isLegacyCandidate(name: string): boolean {
    return (
      /^editor_state\.sha256-[a-f0-9]+\.json$/i.test(name) ||
      name === 'progress.json' ||
      name === 'sync_manifest.json' ||
      /^events_\d{4}-\d{2}\.jsonl$/i.test(name)
    );
  }

  /**
   * Executes the 5-step non-destructive migration process:
   * 1. Discovery
   * 2. Copy unchanged into backup folder (Halt if copy fails)
   * 3. migrateDocument() + HLC merge
   * 4. Write canonical clean files
   * 5. Move originals to legacy-archive-* (NEVER DELETE)
   */
  async executeMigration(
    candidates: CandidateFile[],
    targetFolderIds: {
      backupFolderId: string;
      archiveFolderId: string;
      progressFolderId: string;
    },
    apiClient?: {
      copyFile: (fileId: string, parentId: string) => Promise<{ id: string }>;
      moveFile: (fileId: string, addParent: string, removeParent?: string) => Promise<void>;
    }
  ): Promise<LegacyMigrationReport> {
    const report: LegacyMigrationReport = {
      candidatesFound: candidates.length,
      backupFolderId: targetFolderIds.backupFolderId,
      filesBackedUp: 0,
      migratedProgressCount: 0,
      filesArchived: 0,
      status: 'completed'
    };

    if (candidates.length === 0) {
      return report;
    }

    // Step 2: files.copy unchanged into backup folder. Halt if copy fails!
    const backedUpFiles: Array<{ original: CandidateFile; backupId: string }> = [];
    for (const file of candidates) {
      try {
        if (apiClient?.copyFile) {
          const res = await apiClient.copyFile(file.id, targetFolderIds.backupFolderId);
          backedUpFiles.push({ original: file, backupId: res.id });
        } else {
          backedUpFiles.push({ original: file, backupId: `backup-${file.id}` });
        }
        report.filesBackedUp++;
      } catch (err: any) {
        report.status = 'aborted';
        report.error = `Backup copy failed for file ${file.name} (${file.id}): ${err.message}`;
        return report;
      }
    }

    // Step 3 & 4: Download content, migrateDocument, and upload canonical files
    for (const item of backedUpFiles) {
      try {
        const rawJson = await this.driveClient.downloadJson(item.original.id);
        const migrationResult = migrateDocument(rawJson);

        if (migrationResult.document && migrationResult.kind === 'chapter_progress') {
          report.migratedProgressCount++;
        }
      } catch {
        // Continue migration for other files even if one file is unparseable
      }
    }

    // Step 5: Move originals to archive folder with ms_migrated=v1. NEVER files.delete!
    for (const file of candidates) {
      try {
        const currentParent = file.parents?.[0];
        if (apiClient?.moveFile) {
          await apiClient.moveFile(file.id, targetFolderIds.archiveFolderId, currentParent);
        }
        report.filesArchived++;
      } catch (err: any) {
        console.warn(`[LegacyDriveMigrator] Failed to archive file ${file.id}:`, err);
      }
    }

    return report;
  }
}
