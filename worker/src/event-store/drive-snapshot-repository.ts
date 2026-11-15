import { DriveMirrorError, type GoogleDriveClient, type DriveSnapshotRef } from '../google-drive';
import { snapshotName } from '../immutable-snapshot';
import { sha256Hex } from '../drive-projection';
import type { DriveMirrorState } from './drive-mirror-state';
import type { DriveSnapshotWrite } from './drive-mirror-service';

async function readPriorDriveContent(input: {
  client: GoogleDriveClient;
  state: DriveMirrorState;
  path: string;
  logicalName: string;
  parentId: string;
  mimeType: string;
}): Promise<string | undefined> {
  const snapshot = input.state.snapshots?.[input.path];
  if (snapshot) {
    const content = await input.client.readTextContent(snapshot.id);
    if ((await sha256Hex(content)) !== snapshot.sha256) throw new DriveMirrorError('invalid_response');
    const expectedName = await snapshotName(input.logicalName, content);
    if (snapshot.name !== expectedName) throw new DriveMirrorError('invalid_response');
    return content;
  }

  const id = input.state.files[input.path]?.id ?? (await input.client.findTextFileId(input.logicalName, input.parentId, input.mimeType));
  if (!id) return undefined;
  const content = await input.client.readTextContent(id);
  const expectedHash = input.state.fileHashes[input.path];
  if (expectedHash && (await sha256Hex(content)) !== expectedHash) throw new DriveMirrorError('invalid_response');
  return content;
}

export async function writeDriveSnapshot(input: DriveSnapshotWrite): Promise<DriveSnapshotRef> {
  const previous = await readPriorDriveContent(input);
  const content = previous === undefined ? input.desiredContent : input.mergeContent(previous, input.desiredContent);
  const saved = await input.client.writeImmutableTextFile({
    logicalName: input.logicalName,
    parentId: input.parentId,
    mimeType: input.mimeType,
    content,
  });
  input.state.snapshots = { ...(input.state.snapshots ?? {}), [input.path]: saved };
  if (input.trackHash !== false) input.state.fileHashes[input.path] = saved.sha256;
  return saved;
}
