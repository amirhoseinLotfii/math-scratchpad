export const WORKSPACE_TEMPLATES = ['general', 'functions', 'powers'] as const;
export type WorkspaceTemplate = typeof WORKSPACE_TEMPLATES[number];

export const WORKSPACE_TEMPLATE_LABELS: Record<WorkspaceTemplate, string> = {
  general: 'General',
  functions: 'Functions',
  powers: 'Powers',
};

export const WORKSPACE_TEMPLATE_TOOLS: Record<WorkspaceTemplate, string[]> = {
  general: ['fraction', 'group', 'root', 'power', '='],
  functions: ['x', 'sin', 'cos', '±', '='],
  powers: ['power', 'root', 'fraction', '±', '='],
};

export function workspaceTemplateStorageKey(bankId?: string, chapter?: number): string {
  const bank = bankId?.trim() || 'default';
  const chapterScope = Number.isInteger(chapter) && (chapter as number) >= 0 ? String(chapter) : 'general';
  return `math-scratchpad-ui:workspace-template:v1:${encodeURIComponent(bank)}:${chapterScope}`;
}

export function readWorkspaceTemplate(storage: Pick<Storage, 'getItem'>, bankId?: string, chapter?: number): WorkspaceTemplate {
  try {
    const value = storage.getItem(workspaceTemplateStorageKey(bankId, chapter));
    return WORKSPACE_TEMPLATES.find(template => template === value) ?? 'general';
  } catch {
    return 'general';
  }
}

export function writeWorkspaceTemplate(storage: Pick<Storage, 'setItem'>, template: WorkspaceTemplate, bankId?: string, chapter?: number): boolean {
  try {
    storage.setItem(workspaceTemplateStorageKey(bankId, chapter), template);
    return true;
  } catch {
    return false;
  }
}
