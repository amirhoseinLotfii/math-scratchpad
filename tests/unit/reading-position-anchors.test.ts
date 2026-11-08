import { describe, expect, it } from 'vitest';
import { conceptAnchorId, parseAnchorId, sectionAnchorId } from '../../src/features/progress/reading-position-anchors';

describe('reading-position anchors', () => {
  it('builds stable section and concept anchor ids', () => {
    expect(sectionAnchorId('s1')).toBe('section:s1');
    expect(conceptAnchorId('c2')).toBe('concept:c2');
  });

  it('parses known anchor kinds and keeps unknown ids intact', () => {
    expect(parseAnchorId('section:alpha')).toEqual({ kind: 'section', id: 'alpha' });
    expect(parseAnchorId('concept:beta:extra')).toEqual({ kind: 'concept', id: 'beta:extra' });
    expect(parseAnchorId('legacy-id')).toEqual({ kind: 'unknown', id: 'legacy-id' });
  });
});
