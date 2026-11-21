import { useRef, useState, type MutableRefObject } from 'react';
import {
  buildTutorExport,
  downloadText,
  missingFinalAnswers,
} from '../../features/session/export/tutor-export';
import {
  lessonExportDataFromState,
  readLessonExportData,
  type LessonExportData,
  type LessonProgressState,
} from '../../features/lessons/lesson-progress-store';
import type { DriveBank } from '../../features/drive-bank/drive-bank';
import { isoLocal } from '../../model';
import { serialize } from '../../persistence';
import { fingerprint, reviewMessage, writeClipboard } from '../../review';
import { actions, type ScratchStore } from '../../store';
import { emitLearnEvent, type LearnEventContext } from '../../sync/events';

const stamp = () => isoLocal().slice(0, 16).replace(/:/g, '');

export function useReviewCopy({
  store,
  loadedBank,
  lessonProgressRef,
  sessionEventContext,
  sessionId,
  onFallbackBackupJson,
}: {
  store: ScratchStore;
  loadedBank: { bank: DriveBank; version: string } | null;
  lessonProgressRef: MutableRefObject<LessonProgressState>;
  sessionEventContext: LearnEventContext;
  sessionId: string;
  onFallbackBackupJson: (text: string) => void;
}) {
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [exportWarning, setExportWarning] = useState<number[] | null>(null);
  const copyBusy = useRef(false);

  async function copyReview() {
    if (copyBusy.current) return;
    copyBusy.current = true;
    setBusy(true);
    const doc = store.getState().doc,
      snapshot = fingerprint(doc),
      id = doc.exerciseId;
    try {
      const text = reviewMessage(doc);
      if (await writeClipboard(text)) {
        store.dispatch(actions.copied({ exerciseId: id, snapshot }));
        setManual('');
      } else {
        setManual(text);
        store.dispatch(
          actions.notice('Clipboard blocked. Select the review message and copy it manually.')
        );
      }
    } finally {
      copyBusy.current = false;
      setBusy(false);
    }
  }

  async function copySession() {
    const text = serialize(store.getState());
    if (await writeClipboard(text)) store.dispatch(actions.notice('Full session JSON copied.'));
    else {
      onFallbackBackupJson(text);
      store.dispatch(
        actions.notice('Clipboard blocked. Select and copy the session JSON manually.')
      );
    }
  }

  async function exportTutor(force = false) {
    const doc = store.getState().doc,
      missing = missingFinalAnswers(doc);
    if (!force && missing.length) {
      setExportWarning(missing);
      return;
    }
    setExportWarning(null);
    const meta = doc.session;
    let lessonExport: LessonExportData | undefined;
    if (meta?.bankId && meta.bankVersion) {
      if (
        loadedBank?.bank.bank_id === meta.bankId &&
        loadedBank.version === meta.bankVersion &&
        loadedBank.bank.lessons?.length
      )
        lessonExport = lessonExportDataFromState(lessonProgressRef.current);
      else {
        const saved = readLessonExportData(meta.bankId, meta.bankVersion);
        if (saved.found) lessonExport = saved.data;
      }
    }
    const data = buildTutorExport(doc, new Date(), lessonExport),
      text = JSON.stringify(data, null, 2);
    emitLearnEvent(sessionEventContext, {
      type: 'report_generated',
      itemId: `session:${data.session_id}`,
      note: 'Tutor export generated.',
    });
    const copiedOk = await writeClipboard(text),
      saved = downloadText(`math-session-${data.session_id}.json`, text);
    if (!copiedOk) onFallbackBackupJson(text);
    store.dispatch(
      actions.notice(
        `Tutor export ready${copiedOk ? ' · copied' : ''}${saved ? ' · downloaded' : ''}.`
      )
    );
  }

  function downloadBackup() {
    const saved = downloadText(`math-scratchpad-backup-${stamp()}.json`, serialize(store.getState()));
    if (saved)
      emitLearnEvent(sessionEventContext, {
        type: 'backup_created',
        itemId: `session:${sessionId || 'unknown'}`,
      });
    store.dispatch(
      actions.notice(
        saved ? 'Backup file downloaded.' : 'Download blocked. Use Session JSON to copy the backup.'
      )
    );
  }

  return {
    manual,
    setManual,
    busy,
    exportWarning,
    setExportWarning,
    copyReview,
    copySession,
    exportTutor,
    downloadBackup,
  };
}
