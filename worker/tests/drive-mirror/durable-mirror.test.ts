import { describe, expect, it } from 'vitest';
import { runInDurableObject } from 'cloudflare:test';
import { type LearnEvent } from '../../../shared/contracts/learn-event';
import { serializeJsonlEvents, sha256Hex } from '../../src/drive-projection';
import { OWNER_EMAIL, testEnv, makeEvent, sequenced, makeMemoryDrive, appendForOwner, runMirror } from '../helpers/drive-mirror';
describe('Durable Object Drive mirror integration', () => {
  it('writes a complete event, progress projection, and hash manifest under the private sync folders', async () => {
    const event = makeEvent(1, {
      type: 'check_answer',
      questionText: 'What is the domain?',
      userAnswer: '{1, 2}',
      verdict: 'submitted',
      verdictSource: 'none',
      steps: ['read the ordered pairs'],
    });
    await appendForOwner(event);
    const drive = makeMemoryDrive();
    const status = (await runMirror(drive.client)) as { status: string; pendingCount: number };
    expect(status).toMatchObject({ status: 'synced', pendingCount: 0 });
    expect(drive.uploads.map((upload) => upload.name)).toEqual([
      expect.stringMatching(/^events_2026-11\.sha256-[a-f0-9]{64}\.jsonl$/),
      expect.stringMatching(/^progress\.sha256-[a-f0-9]{64}\.json$/),
      expect.stringMatching(/^editor_state\.sha256-[a-f0-9]{64}\.json$/),
      expect.stringMatching(/^sync_manifest\.sha256-[a-f0-9]{64}\.json$/),
    ]);
    expect(drive.uploads[0].parentId).toBe('events-folder');
    expect(drive.uploads[1].parentId).toBe('state-folder');
    expect(drive.uploads[2].parentId).toBe('state-folder');
    const savedEvent = JSON.parse(drive.contentByName.get('events_2026-11.jsonl')!.trim()) as LearnEvent;
    expect(savedEvent).toEqual(event);
    expect(JSON.parse(drive.contentByName.get('progress.json')!)).toMatchObject({
      currentPosition: { chapter: 1, lesson: '1.1', section: '1.1' },
      lastEventId: event.id,
      lastSeq: 1,
    });
    expect(JSON.parse(drive.contentByName.get('sync_manifest.json')!)).toMatchObject({
      lastSeq: 1,
      lastEventId: event.id,
      files: expect.arrayContaining([
        expect.objectContaining({ path: 'events/events_2026-11.jsonl', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
        expect.objectContaining({ path: 'state/progress.json', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
      ]),
    });
    expect(drive.uploads.every((upload) => !upload.name.includes('DriveSyncFiles'))).toBe(true);
  });

  it('keeps previous Drive snapshot bytes while publishing a new event snapshot', async () => {
    const firstEvent = makeEvent(61, { type: 'lesson_open' });
    const secondEvent = makeEvent(62, { type: 'lesson_open', ts: '2026-11-03T00:00:00.000Z' });
    await appendForOwner(firstEvent);
    const drive = makeMemoryDrive();
    await runMirror(drive.client);
    const first = drive.uploads.find((upload) => upload.name.startsWith('events_2026-11.sha256-'))!;
    const firstContent = drive.filesById.get(first.id)!.content;

    await appendForOwner(secondEvent);
    const status = (await runMirror(drive.client)) as { status: string };
    const eventSnapshots = drive.uploads.filter((upload) => upload.name.startsWith('events_2026-11.sha256-'));
    const latest = eventSnapshots.at(-1)!;
    const manifest = JSON.parse(drive.contentByName.get('sync_manifest.json')!) as {
      files: Array<{ path: string; id: string; name: string }>;
    };

    expect(status.status).toBe('synced');
    expect(eventSnapshots).toHaveLength(2);
    expect(first.id).not.toBe(latest.id);
    expect(drive.filesById.get(first.id)!.content).toBe(firstContent);
    expect(firstContent).toContain(firstEvent.id);
    expect(firstContent).not.toContain(secondEvent.id);
    expect(drive.filesById.get(latest.id)!.content).toContain(firstEvent.id);
    expect(drive.filesById.get(latest.id)!.content).toContain(secondEvent.id);
    expect(manifest.files).toContainEqual(
      expect.objectContaining({ path: 'events/events_2026-11.jsonl', id: latest.id, name: latest.name }),
    );
  });

  it('migrates a legacy event file into a new snapshot without changing the legacy bytes', async () => {
    const legacyEvent = makeEvent(64, { type: 'lesson_open', ts: '2026-11-01T00:00:00.000Z' });
    const localEvent = makeEvent(65, { type: 'lesson_open', ts: '2026-11-02T00:00:00.000Z' });
    const legacyContent = serializeJsonlEvents([sequenced(1, legacyEvent)]);
    const drive = makeMemoryDrive();
    drive.filesById.set('legacy-events', {
      name: 'events_2026-11.jsonl',
      parentId: 'events-folder',
      mimeType: 'application/x-ndjson',
      content: legacyContent,
    });
    drive.contentByName.set('events_2026-11.jsonl', legacyContent);
    await appendForOwner(localEvent);
    const id = testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase());
    const stub = testEnv.EVENT_STORE.get(id);
    await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.put('drive-mirror-state-v1', {
        status: 'pending',
        lastSeq: 0,
        pendingCount: 1,
        files: { 'events/events_2026-11.jsonl': { id: 'legacy-events', etag: 'legacy-etag' } },
        fileHashes: { 'events/events_2026-11.jsonl': await sha256Hex(legacyContent) },
        snapshots: {},
      });
    });

    const status = (await runMirror(drive.client)) as { status: string };
    const latest = drive.uploads.find((upload) => upload.name.startsWith('events_2026-11.sha256-'))!;
    const events = drive.filesById
      .get(latest.id)!
      .content.trim()
      .split('\n')
      .map((line) => JSON.parse(line) as LearnEvent);

    expect(status.status).toBe('synced');
    expect(drive.filesById.get('legacy-events')!.content).toBe(legacyContent);
    expect(events.map((event) => event.id)).toEqual([legacyEvent.id, localEvent.id]);
    expect(latest.name).not.toBe('events_2026-11.jsonl');
  });

  it('quarantines unclassified events from Drive JSONL and progress while recording the skipped count', async () => {
    const live = makeEvent(41, { type: 'chunk_open', itemId: 'live-position' });
    const testEvent = makeEvent(42, { isTest: true, type: 'chunk_open', itemId: 'test-position' });
    const unclassified = makeEvent(43, { isTest: undefined, type: 'chunk_open', itemId: 'preview-unclassified' });
    await appendForOwner(live);
    await appendForOwner(testEvent);
    await appendForOwner(unclassified);

    const drive = makeMemoryDrive();
    const status = (await runMirror(drive.client)) as { status: string; pendingCount: number; quarantinedCount: number };
    expect(status).toMatchObject({ status: 'synced', pendingCount: 0, quarantinedCount: 1 });

    const eventLines = drive.contentByName.get('events_2026-11.jsonl')!.trim().split('\n');
    const savedEvents = eventLines.map((line) => JSON.parse(line) as LearnEvent);
    expect(savedEvents.map((event) => event.id)).toEqual([live.id, testEvent.id]);
    const progress = JSON.parse(drive.contentByName.get('progress.json')!);
    expect(progress).toMatchObject({ lastEventId: live.id, lastSeq: 1 });
    expect(progress.currentPosition.chunkId).toBe('live-position');
    expect(JSON.parse(drive.contentByName.get('sync_manifest.json')!)).toMatchObject({
      lastSeq: 3,
      lastEventId: unclassified.id,
      quarantinedEventCount: 1,
    });
  });

  it('recovers from a partial Drive failure without duplicating the event on retry', async () => {
    const event = makeEvent(1, {
      type: 'exercise_attempt',
      itemId: 'PC-1.1-L01',
      userAnswer: 'x=2',
      verdict: 'submitted',
      verdictSource: 'none',
    });
    await appendForOwner(event);
    const drive = makeMemoryDrive({ failProgressOnce: true });
    const failed = (await runMirror(drive.client)) as { status: string; lastError: string; pendingCount: number; failureStage: string };
    expect(failed).toMatchObject({ status: 'error', lastError: 'quota_exceeded', pendingCount: 1, failureStage: 'drive_upload' });
    expect(drive.contentByName.get('events_2026-11.jsonl')).toContain(event.id);
    const retried = (await runMirror(drive.client)) as { status: string; pendingCount: number };
    expect(retried).toMatchObject({ status: 'synced', pendingCount: 0 });
    const lines = drive.contentByName.get('events_2026-11.jsonl')!.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).id).toBe(event.id);
    expect(drive.uploads.filter((upload) => upload.name.startsWith('events_2026-11.sha256-'))).toHaveLength(1);
  });

  it('reads and syncs all 50,000 stored events across 500-row SQL pages', async () => {
    const id = testEnv.EVENT_STORE.idFromName(OWNER_EMAIL.toLowerCase());
    const stub = testEnv.EVENT_STORE.get(id);
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.transactionSync(() => {
        for (let index = 1; index <= 50_000; index += 1) {
          const event = makeEvent(index, { ts: '2026-11-02T00:00:00.000Z' });
          state.storage.sql.exec(
            'INSERT INTO learning_events (event_id, event_json, event_ts) VALUES (?, ?, ?)',
            event.id,
            JSON.stringify(event),
            event.ts,
          );
        }
      });
    });
    const drive = makeMemoryDrive();
    const started = performance.now();
    const status = (await runMirror(drive.client)) as { status: string; pendingCount: number };
    const elapsedMs = performance.now() - started;
    const eventLines = drive.contentByName.get('events_2026-11.jsonl')!.trim().split('\n');
    expect(status).toMatchObject({ status: 'synced', pendingCount: 0 });
    expect(eventLines).toHaveLength(50_000);
    expect(JSON.parse(eventLines[0]).id).toBe(makeEvent(1).id);
    expect(JSON.parse(eventLines.at(-1)!).id).toBe(makeEvent(50_000).id);
    expect(JSON.parse(drive.contentByName.get('progress.json')!).lastSeq).toBe(50_000);
    expect(JSON.parse(drive.contentByName.get('sync_manifest.json')!).lastSeq).toBe(50_000);
    expect(elapsedMs).toBeLessThan(20_000);
  }, 60_000);
});
