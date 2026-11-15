import type { WorkerEnv } from '../env';
import {
  DriveMirrorError,
  hasLearningMirrorOwnership,
  type GoogleDriveClient,
  type DriveFolderChild,
  type DriveMirrorKind,
} from '../google-drive';
import type { DriveMirrorState } from './drive-mirror-state';
import { LEARNING_RESET_TRASH_PER_CALL } from './limits';

const mirrorFilePattern = new RegExp(
  String.raw`^(?:events_\d{4}-\d{2}|progress|editor_state|sync_manifest|sync_backup_\d{4}-\d{2}-\d{2})` +
    String.raw`(?:\.sha256-[a-f0-9]{64})?\.(?:jsonl|json)$`,
  'i',
);

function isLearningMirrorFileName(name: string): boolean {
  return mirrorFilePattern.test(name);
}

export async function trashLearningMirrorFiles(
  env: WorkerEnv,
  configured: boolean,
  readDriveState: () => Promise<DriveMirrorState>,
  getClient: () => GoogleDriveClient,
  bankFileId?: string,
): Promise<{
  movedToTrash: number;
  inspectedFiles: number;
  preservedFiles: number;
  protectedBankFileSkipped: boolean;
  foldersFound: number;
  remainingLearningMirrors?: boolean;
}> {
  const state = await readDriveState();
  const stored = state.folders;
  if (!configured) {
    if (stored) throw new DriveMirrorError('not_configured');
    return { movedToTrash: 0, inspectedFiles: 0, preservedFiles: 0, protectedBankFileSkipped: false, foldersFound: 0 };
  }

  const client = getClient();
  const rootName = env.GOOGLE_DRIVE_ROOT_FOLDER_NAME?.trim() || 'Math_Project';
  const rootId = stored?.rootId ?? env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? (await client.findFolderId(rootName, 'root'));
  if (!rootId) return { movedToTrash: 0, inspectedFiles: 0, preservedFiles: 0, protectedBankFileSkipped: false, foldersFound: 0 };
  const root = await client.readFileMetadata(rootId, 'id,name,mimeType,parents,trashed');
  if (root.id !== rootId || root.name !== rootName || root.mimeType !== 'application/vnd.google-apps.folder' || root.trashed === true) {
    throw new DriveMirrorError('invalid_response');
  }

  const syncId = stored?.syncId ?? (await client.findFolderId('03_Sync', rootId));
  if (!syncId) return { movedToTrash: 0, inspectedFiles: 0, preservedFiles: 0, protectedBankFileSkipped: false, foldersFound: 1 };
  await assertDriveFolder(client, syncId, '03_Sync', rootId);

  const targetFolders: Array<{ id: string; parentId: string; kind: DriveMirrorKind }> = [{ id: syncId, parentId: rootId, kind: 'state' }];
  for (const name of ['events', 'state'] as const) {
    const storedId = stored?.[name === 'events' ? 'eventsId' : 'stateId'];
    const id = storedId ?? (await client.findFolderId(name, syncId));
    if (id) {
      await assertDriveFolder(client, id, name, syncId);
      targetFolders.push({ id, parentId: syncId, kind: name });
    }
  }
  const backupsId = stored?.backupsId ?? (await client.findFolderId('06_Backups', rootId));
  if (backupsId) {
    await assertDriveFolder(client, backupsId, '06_Backups', rootId);
    targetFolders.push({ id: backupsId, parentId: rootId, kind: 'backups' });
  }
  const foldersFound = targetFolders.length + 1;

  let movedToTrash = 0;
  let inspectedFiles = 0;
  let preservedFiles = 0;
  let protectedBankFileSkipped = false;
  let trashAttempts = 0;
  for (const folder of targetFolders) {
    const children: DriveFolderChild[] = await client.listFilesInFolder(folder.id);
    for (const child of children) {
      if (child.mimeType === 'application/vnd.google-apps.folder') continue;
      inspectedFiles += 1;
      if (child.id === bankFileId) {
        protectedBankFileSkipped = true;
        preservedFiles += 1;
        continue;
      }
      if (!isLearningMirrorFileName(child.name) || !hasLearningMirrorOwnership(child.appProperties, folder.kind)) {
        preservedFiles += 1;
        continue;
      }
      if (trashAttempts >= LEARNING_RESET_TRASH_PER_CALL) {
        return { movedToTrash, inspectedFiles, preservedFiles, protectedBankFileSkipped, foldersFound, remainingLearningMirrors: true };
      }
      trashAttempts += 1;
      if (await client.trashFileInFolder(child.id, folder.id, folder.kind)) movedToTrash += 1;
    }
  }
  return { movedToTrash, inspectedFiles, preservedFiles, protectedBankFileSkipped, foldersFound };
}

async function assertDriveFolder(client: GoogleDriveClient, id: string, name: string, parentId: string): Promise<void> {
  const metadata = await client.readFileMetadata(id, 'id,name,mimeType,parents,trashed');
  if (
    metadata.id !== id ||
    metadata.name !== name ||
    metadata.mimeType !== 'application/vnd.google-apps.folder' ||
    metadata.trashed === true ||
    !Array.isArray(metadata.parents) ||
    !metadata.parents.includes(parentId)
  ) {
    throw new DriveMirrorError('invalid_response');
  }
}
