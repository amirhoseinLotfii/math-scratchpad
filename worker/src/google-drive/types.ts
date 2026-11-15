export type DriveMirrorErrorCode =
  | 'not_configured'
  | 'reauthorization_required'
  | 'account_mismatch'
  | 'permission_denied'
  | 'quota_exceeded'
  | 'etag_conflict'
  | 'invalid_response'
  | 'duplicate_file'
  | 'subrequest_budget_exceeded'
  | 'network_error';

export class DriveMirrorError extends Error {
  constructor(readonly code: DriveMirrorErrorCode) {
    super(code);
    this.name = 'DriveMirrorError';
  }
}

export type DriveFileRef = { id: string; etag: string };
export type DriveFileContent = DriveFileRef & { content: string };
export type DriveSnapshotRef = { id: string; name: string; sha256: string };
export type DriveMirrorKind = 'events' | 'state' | 'backups';
export type DriveFolderChild = { id: string; name: string; mimeType: string; parents: string[]; appProperties?: Record<string, string> };
export type DriveFileMetadata = {
  id?: unknown;
  name?: unknown;
  mimeType?: unknown;
  parents?: unknown;
  trashed?: unknown;
  appProperties?: unknown;
};
export type MergeContent = (remote: string, desired: string) => string;
export type DriveRequestStage =
  | 'drive_folder_lookup'
  | 'drive_file_lookup'
  | 'drive_file_read'
  | 'drive_lookup'
  | 'drive_create'
  | 'drive_update'
  | 'drive_trash'
  | 'drive_upload';

export type DriveFetch = (input: string, init: RequestInit, stage?: DriveRequestStage) => Promise<Response>;
