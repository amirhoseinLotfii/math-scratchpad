import { flushPersistedSession } from '../features/session/persistence/persistent-store';
import { downloadText } from '../features/session/export/tutor-export';
import { createFullLearningBackup } from './learning-backup';

export async function downloadFullLearningBackup(source: 'auto' | 'local' = 'auto'): Promise<void> {
  await flushPersistedSession();
  const contents = await createFullLearningBackup(new Date(), source);
  const downloadName = `math-scratchpad-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (!downloadText(downloadName, contents)) throw new Error('دانلود فایل پشتیبان آغاز نشد.');
}
