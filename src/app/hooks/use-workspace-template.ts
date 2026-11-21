import { useLayoutEffect, useState } from 'react';
import {
  readWorkspaceTemplate,
  workspaceTemplateStorageKey,
  writeWorkspaceTemplate,
  type WorkspaceTemplate,
} from '../../features/workspace/model/workspace-templates';

export function useWorkspaceTemplate(bankId?: string, chapter?: number) {
  const scope = workspaceTemplateStorageKey(bankId, chapter);
  const [workspaceTemplate, setWorkspaceTemplate] = useState<WorkspaceTemplate>(() => {
    try {
      return readWorkspaceTemplate(window.localStorage, bankId, chapter);
    } catch {
      return 'general';
    }
  });

  useLayoutEffect(() => {
    try {
      setWorkspaceTemplate(readWorkspaceTemplate(window.localStorage, bankId, chapter));
    } catch {
      setWorkspaceTemplate('general');
    }
  }, [scope, bankId, chapter]);

  function changeWorkspaceTemplate(template: WorkspaceTemplate) {
    setWorkspaceTemplate(template);
    try {
      writeWorkspaceTemplate(window.localStorage, template, bankId, chapter);
    } catch {
      /* optional preference */
    }
  }

  return { workspaceTemplate, changeWorkspaceTemplate };
}
