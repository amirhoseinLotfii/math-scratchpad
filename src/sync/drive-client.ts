import { getDriveAccessToken } from '../auth/token-manager';
import { assertNetworkAllowed } from './mode-gate';
import { db } from '../storage/scratchpad-db';
import { ChapterProgress } from '../domain/entities/chapter-progress.types';
import { mergeChapterProgress } from '../domain/sync/lww-merge';

export const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
export const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

export interface DrivePreflightInfo {
  id: string;
  headRevisionId?: string;
  version?: string;
  md5Checksum?: string;
  modifiedTime?: string;
  remoteChanged: boolean;
}

export interface DriveFileMetadata {
  name: string;
  parents?: string[];
  mimeType?: string;
  appProperties?: Record<string, string>;
}

export class GoogleDriveSyncClient {
  constructor(private fetchFn: typeof fetch = fetch) {}

  private getAuthHeaders(): HeadersInit {
    assertNetworkAllowed(DRIVE_API_BASE);
    const token = getDriveAccessToken();
    if (!token) {
      throw new Error('AUTH_REQUIRED_FOR_DRIVE: No valid Drive access token available in memory.');
    }
    return {
      Authorization: `Bearer ${token}`
    };
  }

  /**
   * Probes Google Drive connectivity and quota (5s timeout) - §4.3
   */
  async probe(): Promise<{ email?: string; usageBytes?: number; quotaBytes?: number }> {
    const headers = this.getAuthHeaders();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await this.fetchFn(
        `${DRIVE_API_BASE}/about?fields=user(emailAddress),storageQuota(limit,usage)`,
        { headers, signal: controller.signal }
      );
      if (!res.ok) {
        throw new Error(`Drive probe failed with HTTP status ${res.status}`);
      }
      const data = await res.json();
      return {
        email: data.user?.emailAddress,
        usageBytes: data.storageQuota?.usage ? Number(data.storageQuota.usage) : undefined,
        quotaBytes: data.storageQuota?.limit ? Number(data.storageQuota.limit) : undefined
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Preflight check on a file before modifying it (§4.3)
   * Inspects headRevisionId, version, and md5Checksum to detect remote changes.
   */
  async preflightCheck(
    fileId: string,
    lastKnownRevision?: string
  ): Promise<DrivePreflightInfo> {
    const headers = this.getAuthHeaders();
    const fields = 'id,headRevisionId,version,md5Checksum,modifiedTime,appProperties,capabilities(canReadRevisions)';

    const res = await this.fetchFn(`${DRIVE_API_BASE}/files/${fileId}?fields=${fields}`, {
      headers
    });
    if (!res.ok) {
      throw new Error(`Preflight check failed for file ${fileId}: HTTP ${res.status}`);
    }

    const data = await res.json();
    const currentRev = data.headRevisionId || data.version || data.md5Checksum;
    const remoteChanged = Boolean(lastKnownRevision && currentRev && currentRev !== lastKnownRevision);

    return {
      id: data.id,
      headRevisionId: data.headRevisionId,
      version: data.version,
      md5Checksum: data.md5Checksum,
      modifiedTime: data.modifiedTime,
      remoteChanged
    };
  }

  /**
   * Downloads raw JSON content of a Drive file.
   */
  async downloadJson<T = unknown>(fileId: string): Promise<T> {
    const headers = this.getAuthHeaders();
    const res = await this.fetchFn(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, { headers });
    if (!res.ok) {
      throw new Error(`Failed to download file ${fileId}: HTTP ${res.status}`);
    }
    return await res.json();
  }

  /**
   * Performs multipart upload (create or update) for JSON documents <= 5MB (§4.3)
   */
  async uploadMultipartJson(
    metadata: DriveFileMetadata,
    jsonPayload: object,
    existingFileId?: string
  ): Promise<{ fileId: string; headRevisionId?: string; version?: string }> {
    const headers = { ...this.getAuthHeaders() } as Record<string, string>;
    const boundary = 'ms_boundary_' + Math.random().toString(36).substring(2);
    headers['Content-Type'] = `multipart/related; boundary=${boundary}`;

    const metadataPart = JSON.stringify(metadata);
    const mediaPart = JSON.stringify(jsonPayload, null, 2);

    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadataPart}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      `${mediaPart}\r\n` +
      `--${boundary}--`;

    const url = existingFileId
      ? `${DRIVE_UPLOAD_BASE}/files/${existingFileId}?uploadType=multipart`
      : `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`;

    const method = existingFileId ? 'PATCH' : 'POST';

    const res = await this.fetchFn(url, {
      method,
      headers,
      body
    });

    if (!res.ok) {
      throw new Error(`Multipart upload failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    return {
      fileId: data.id,
      headRevisionId: data.headRevisionId,
      version: data.version
    };
  }

  /**
   * Safely synchronizes chapter progress with Google Drive:
   * 1. Runs preflight check
   * 2. If remote changed, downloads and runs HLC LWW merge
   * 3. Uploads merged document via multipart upload
   */
  async syncChapterProgress(
    chapterId: string,
    localProgress: ChapterProgress,
    cachedFileId?: string,
    lastKnownRev?: string
  ): Promise<{ fileId: string; mergedProgress: ChapterProgress; revision?: string }> {
    let progressToUpload = localProgress;

    if (cachedFileId) {
      const preflight = await this.preflightCheck(cachedFileId, lastKnownRev);
      if (preflight.remoteChanged) {
        // Download remote and merge
        const remoteProgress = await this.downloadJson<ChapterProgress>(cachedFileId);
        progressToUpload = mergeChapterProgress(localProgress, remoteProgress);
        // Persist locally too
        await db.progress_docs.put(progressToUpload);
      }
    }

    const metadata: DriveFileMetadata = {
      name: `${chapterId}.json`,
      appProperties: {
        ms_kind: 'progress',
        ms_ch: chapterId,
        ms_bv: progressToUpload.bankVersion,
        ms_hlc: progressToUpload.updatedHlc
      }
    };

    const uploadRes = await this.uploadMultipartJson(
      metadata,
      progressToUpload,
      cachedFileId
    );

    return {
      fileId: uploadRes.fileId,
      mergedProgress: progressToUpload,
      revision: uploadRes.headRevisionId || uploadRes.version
    };
  }
}
