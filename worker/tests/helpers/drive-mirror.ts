import { afterEach, expect, vi } from 'vitest';
import { env, reset, runInDurableObject } from 'cloudflare:test';
import { type LearnEvent } from '../../../shared/contracts/learn-event';
import { sha256Hex, type SequencedLearnEvent } from '../../src/drive-projection';
import { DriveMirrorError, GoogleDriveClient } from '../../src/google-drive';
import { snapshotName } from '../../src/immutable-snapshot';
import { createApp, type IdTokenVerifier } from '../../src/index';
import type { GoogleIdentity, WorkerEnv } from '../../src/env';

export const OWNER_EMAIL = 'owner@example.test';
export const ALLOWED_ORIGIN = 'https://amirhoseinlotfii.github.io';
export const testEnv = env as unknown as WorkerEnv;
export const owner: GoogleIdentity = { sub: 'test-owner', email: OWNER_EMAIL, email_verified: true };
export const validVerifier: IdTokenVerifier = async (token) => {
  if (token !== 'valid-test-token') throw new Error('invalid_token');
  return owner;
};

afterEach(async () => {
  vi.restoreAllMocks();
  await reset();
});

export function makeEvent(index: number, overrides: Partial<LearnEvent> = {}): LearnEvent {
  const uuid = (value: number) => `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
  return {
    id: uuid(index),
    schema: 1,
    isTest: false,
    ts: new Date(Date.UTC(2026, 10, 2, 0, 0, index % 60)).toISOString(),
    deviceId: uuid(99_999),
    bankVersion: 'v21',
    session: 'test-session',
    chapter: 1,
    lesson: '1.1',
    section: '1.1',
    concept: 'relations',
    type: 'lesson_open',
    ...overrides,
  };
}

export function sequenced(index: number, event: LearnEvent = makeEvent(index)): SequencedLearnEvent {
  return { seq: index, event };
}

export function makeClient(fetcher: typeof fetch, email = OWNER_EMAIL) {
  const workerEnv = {
    OWNER_EMAIL: email,
    GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
    GOOGLE_DRIVE_CLIENT_SECRET: 'not-a-real-secret',
    GOOGLE_DRIVE_REFRESH_TOKEN: 'not-a-real-token',
  } as WorkerEnv;
  return new GoogleDriveClient(workerEnv, fetcher, () => Date.UTC(2026, 10, 2));
}

export function jsonResponse(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

export function withGoogleAuth(
  handleDrive: (url: URL, init: RequestInit) => Promise<Response> | Response,
  identity: { email: string; email_verified: boolean } = { email: OWNER_EMAIL, email_verified: true },
): typeof fetch {
  return (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (url.href === 'https://oauth2.googleapis.com/token') {
      const params = new URLSearchParams(String(init.body ?? ''));
      expect(params.get('grant_type')).toBe('refresh_token');
      expect(params.get('refresh_token')).toBe('not-a-real-token');
      return jsonResponse({ access_token: 'test-access-token', expires_in: 3600 });
    }
    if (url.href === 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,me)') {
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-access-token');
      return jsonResponse({ user: { emailAddress: identity.email, me: identity.email_verified } });
    }
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-access-token');
    return handleDrive(url, init);
  }) as typeof fetch;
}

export function makeMemoryDrive(options: { failProgressOnce?: boolean; loseBackupResponseOnce?: boolean } = {}) {
  const contentByName = new Map<string, string>();
  const filesById = new Map<string, { name: string; parentId: string; mimeType: string; content: string }>();
  const uploads: Array<{ name: string; parentId: string; content: string; id: string }> = [];
  let nextId = 0;
  const client = {
    diagnosticStage: 'drive_upload',
    ensureRootFolder: async (name: string) => {
      expect(name).toBe('Math_Project');
      return 'root-folder';
    },
    ensureFolder: async (name: string, parentId: string) => {
      if (name === '03_Sync') expect(parentId).toBe('root-folder');
      if (name === 'events' || name === 'state') expect(parentId).toBe('sync-folder');
      if (name === '06_Backups') expect(parentId).toBe('root-folder');
      return name === '03_Sync'
        ? 'sync-folder'
        : name === 'events'
          ? 'events-folder'
          : name === '06_Backups'
            ? 'backups-folder'
            : 'state-folder';
    },
    findTextFileId: async (name: string, parentId: string, mimeType: string) => {
      const matches = [...filesById.entries()].filter(
        ([, file]) => file.name === name && file.parentId === parentId && file.mimeType === mimeType,
      );
      if (matches.length > 1) throw new DriveMirrorError('duplicate_file');
      return matches[0]?.[0];
    },
    readTextContent: async (id: string) => {
      const file = filesById.get(id);
      if (!file) throw new DriveMirrorError('permission_denied');
      return file.content;
    },
    writeImmutableTextFile: async (input: { logicalName: string; parentId: string; mimeType: string; content: string }) => {
      if (options.failProgressOnce && input.logicalName === 'progress.json') {
        options.failProgressOnce = false;
        throw new DriveMirrorError('quota_exceeded');
      }
      const name = await snapshotName(input.logicalName, input.content);
      const existing = [...filesById.entries()].filter(
        ([, file]) => file.name === name && file.parentId === input.parentId && file.mimeType === input.mimeType,
      );
      if (existing.length > 1) throw new DriveMirrorError('duplicate_file');
      let id = existing[0]?.[0];
      if (id) {
        if (existing[0][1].content !== input.content) throw new DriveMirrorError('invalid_response');
      } else {
        id = `snapshot-${++nextId}`;
        filesById.set(id, { name, parentId: input.parentId, mimeType: input.mimeType, content: input.content });
        uploads.push({ name, parentId: input.parentId, content: input.content, id });
      }
      contentByName.set(name, input.content);
      contentByName.set(input.logicalName, input.content);
      if (options.loseBackupResponseOnce && input.logicalName.startsWith('sync_backup_')) {
        options.loseBackupResponseOnce = false;
        throw new DriveMirrorError('network_error');
      }
      return { id, name, sha256: await sha256Hex(input.content) };
    },
  };
  return { client, contentByName, filesById, uploads };
}

export async function appendForOwner(event: LearnEvent): Promise<void> {
  const app = createApp(validVerifier);
  const response = await app.fetch(
    new Request('https://worker.test/events', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-test-token', Origin: ALLOWED_ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [event] }),
    }),
    testEnv,
  );
  expect(response.status).toBe(200);
}

export async function runMirror(client: object) {
  const id = testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase());
  const stub = testEnv.EVENT_STORE.get(id);
  return runInDurableObject(stub, async (instance) => {
    const internals = instance as unknown as { driveClient?: object; performDriveSync: () => Promise<unknown> };
    internals.driveClient = client;
    return internals.performDriveSync();
  });
}

export async function runWeeklyBackup(client: object, now: Date) {
  const id = testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase());
  const stub = testEnv.EVENT_STORE.get(id);
  return runInDurableObject(stub, (instance) => {
    const internals = instance as unknown as {
      driveClient?: object;
      driveConfigured: () => boolean;
      performWeeklyBackup: (date: Date) => Promise<unknown>;
    };
    internals.driveConfigured = () => true;
    internals.driveClient = client;
    return internals.performWeeklyBackup(now);
  });
}
