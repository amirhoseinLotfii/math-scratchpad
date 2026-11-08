/** Stable reading-position anchor ids for lesson content. */

export function sectionAnchorId(sectionId: string): string {
  return `section:${sectionId}`;
}

export function conceptAnchorId(conceptId: string): string {
  return `concept:${conceptId}`;
}

export function parseAnchorId(anchorId: string): { kind: 'section' | 'concept' | 'unknown'; id: string } {
  const [kind, ...rest] = anchorId.split(':');
  const id = rest.join(':');
  if ((kind === 'section' || kind === 'concept') && id) return { kind, id };
  return { kind: 'unknown', id: anchorId };
}
