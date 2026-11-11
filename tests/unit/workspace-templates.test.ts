import { describe, expect, it } from 'vitest';
import { readWorkspaceTemplate, workspaceTemplateStorageKey, writeWorkspaceTemplate } from '../../src/features/workspace/model/workspace-templates';

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
  };
}

describe('chapter workspace template preference', () => {
  it('uses General by default and keeps chapter preferences scoped by bank and chapter', () => {
    const local = storage();
    expect(readWorkspaceTemplate(local, 'bank/1', 2)).toBe('general');
    expect(writeWorkspaceTemplate(local, 'functions', 'bank/1', 2)).toBe(true);
    expect(readWorkspaceTemplate(local, 'bank/1', 2)).toBe('functions');
    expect(readWorkspaceTemplate(local, 'bank/1', 3)).toBe('general');
    expect(readWorkspaceTemplate(local, 'bank/2', 2)).toBe('general');
    expect(workspaceTemplateStorageKey('bank/1', 2)).toContain('bank%2F1');
  });

  it('ignores unknown stored preference values', () => {
    const local = storage();
    local.setItem(workspaceTemplateStorageKey('bank/1', 2), 'unknown');
    expect(readWorkspaceTemplate(local, 'bank/1', 2)).toBe('general');
  });
});
