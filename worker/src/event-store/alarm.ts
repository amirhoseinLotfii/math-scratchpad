import type { DriveMirrorState } from './drive-mirror-state';

type MirrorAlarmPorts = {
  notionConfigured: () => boolean;
  driveConfigured: () => boolean;
  isLearningResetLocked: () => boolean;
  withMirrorSubrequestBudget: <T>(operation: () => Promise<T>) => Promise<unknown>;
  syncNotion: () => Promise<unknown>;
  syncDrive: () => Promise<unknown>;
  readDriveState: () => Promise<DriveMirrorState>;
  syncWeeklyBackup: () => Promise<unknown>;
};

/** Durable Object alarm retries configured private mirrors after transient failures. */
export async function runMirrorAlarm(ports: MirrorAlarmPorts): Promise<void> {
  if (ports.isLearningResetLocked()) return;
  await ports.withMirrorSubrequestBudget(async () => {
    // Notion may not be blocked by a failed Google Drive request.
    const work: Promise<unknown>[] = [];
    if (ports.notionConfigured()) work.push(ports.syncNotion());
    if (ports.driveConfigured()) {
      work.push(
        (async () => {
          await ports.syncDrive();
          if ((await ports.readDriveState()).weeklyBackup?.status === 'error') await ports.syncWeeklyBackup();
        })(),
      );
    }
    return Promise.allSettled(work);
  });
}
