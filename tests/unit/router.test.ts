import { describe, expect, it } from 'vitest';
import { buildRouteUrl, parseRoute } from '../../src/app/router';

describe('App Router & URL Deep Linking - Section 1', () => {
  it('parses empty or root hash as workspace', () => {
    const mockLoc = { hash: '', search: '' } as Location;
    const route = parseRoute(mockLoc);
    expect(route.view).toBe('workspace');
  });

  it('parses lesson route with item deep link (#/lesson/L-01/item/q2)', () => {
    const mockLoc = { hash: '#/lesson/L-01/item/q2', search: '' } as Location;
    const route = parseRoute(mockLoc);
    expect(route.view).toBe('lesson');
    expect(route.lessonId).toBe('L-01');
    expect(route.itemId).toBe('q2');
  });

  it('parses chapter practice route (#/chapter/PC-1.1/item/PC-1.1-L02)', () => {
    const mockLoc = { hash: '#/chapter/PC-1.1/item/PC-1.1-L02', search: '' } as Location;
    const route = parseRoute(mockLoc);
    expect(route.view).toBe('workspace');
    expect(route.chapterId).toBe('PC-1.1');
    expect(route.itemId).toBe('PC-1.1-L02');
  });

  it('builds standard hash URLs accurately', () => {
    const url1 = buildRouteUrl({ view: 'lesson', lessonId: 'L-01', itemId: 'q2' });
    expect(url1).toBe('#/lesson/L-01/item/q2');

    const url2 = buildRouteUrl({ view: 'practice', chapterId: 'PC-1.1', itemId: 'X23' });
    expect(url2).toBe('#/practice/PC-1.1/item/X23');

    const url3 = buildRouteUrl({ view: 'offline' });
    expect(url3).toBe('#/offline');
  });

  it('falls back to search params if hash is empty (?chapter=PC-1.1&item=L01)', () => {
    const mockLoc = { hash: '', search: '?chapter=PC-1.1&item=L01' } as Location;
    const route = parseRoute(mockLoc);
    expect(route.chapterId).toBe('PC-1.1');
    expect(route.itemId).toBe('L01');
  });
});
