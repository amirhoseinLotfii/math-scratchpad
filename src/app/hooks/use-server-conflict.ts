import { useEffect, useState } from 'react';
import { getAuthenticatedServerStorage } from '../../sync/browser-db';
import {
  SERVER_STORAGE_CONFLICT_EVENT,
  type ServerStorageConflict,
  type ServerStorageConflictChoice,
} from '../../sync/server-storage';

export function useServerConflict() {
  const [serverConflict, setServerConflict] = useState<ServerStorageConflict | null>(null);
  const [serverConflictBusy, setServerConflictBusy] = useState(false);
  const [serverConflictError, setServerConflictError] = useState('');

  useEffect(() => {
    const refreshConflict = () =>
      setServerConflict(getAuthenticatedServerStorage()?.getConflicts()[0] ?? null);
    window.addEventListener(SERVER_STORAGE_CONFLICT_EVENT, refreshConflict);
    refreshConflict();
    return () => window.removeEventListener(SERVER_STORAGE_CONFLICT_EVENT, refreshConflict);
  }, []);

  async function resolveServerConflict(choice: ServerStorageConflictChoice) {
    const storage = getAuthenticatedServerStorage();
    if (!storage || !serverConflict || serverConflictBusy) return;
    setServerConflictBusy(true);
    setServerConflictError('');
    try {
      await storage.resolveConflict(serverConflict.key, choice);
      setServerConflict(storage.getConflicts()[0] ?? null);
    } catch (problem) {
      setServerConflictError(
        problem instanceof Error
          ? problem.message
          : 'The saved version could not be resolved. Try again.'
      );
      setServerConflict(storage.getConflicts()[0] ?? serverConflict);
    } finally {
      setServerConflictBusy(false);
    }
  }

  return {
    serverConflict,
    serverConflictBusy,
    serverConflictError,
    resolveServerConflict,
  };
}
