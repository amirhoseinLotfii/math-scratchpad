import { DriveMirrorError, type DriveMirrorKind } from './types';
export const MATH_SCRATCHPAD_DRIVE_OWNER = 'math-scratchpad';

type MirrorAppProperties = { msOwner: string; msKind: DriveMirrorKind | 'other' };

export function mirrorKindForName(name: string): DriveMirrorKind | 'other' {
  if (/^events_\d{4}-\d{2}\.jsonl$/i.test(name)) return 'events';
  if (/^sync_backup_\d{4}-\d{2}-\d{2}\.json$/i.test(name)) return 'backups';
  if (/^(?:progress|editor_state|sync_manifest|server_state)\.json$/i.test(name)) return 'state';
  return 'other';
}

export function mirrorAppProperties(kind: DriveMirrorKind | 'other'): MirrorAppProperties {
  return { msOwner: MATH_SCRATCHPAD_DRIVE_OWNER, msKind: kind };
}

export function hasLearningMirrorOwnership(value: unknown, expectedKind?: DriveMirrorKind | 'other'): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const properties = value as Record<string, unknown>;
  return (
    properties.msOwner === MATH_SCRATCHPAD_DRIVE_OWNER &&
    (expectedKind ? properties.msKind === expectedKind : ['events', 'state', 'backups'].includes(String(properties.msKind)))
  );
}

export function parseAppProperties(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DriveMirrorError('invalid_response');
  const properties = value as Record<string, unknown>;
  if (Object.values(properties).some((property) => typeof property !== 'string')) throw new DriveMirrorError('invalid_response');
  return properties as Record<string, string>;
}
