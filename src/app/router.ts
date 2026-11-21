import { useEffect, useState } from 'react';

export type AppView = 'workspace' | 'lesson' | 'practice' | 'offline' | 'settings';

export interface AppRoute {
  view: AppView;
  chapterId?: string;
  lessonId?: string;
  itemId?: string;
  sectionId?: string;
  stepIndex?: number;
  rawPath: string;
}

/**
 * Parses the current browser URL into an AppRoute.
 * Prioritizes hash routing (e.g. #/chapter/:chapterId/item/:itemId or #/lesson/:lessonId)
 * with query-string fallback (?chapter=...&item=...).
 */
export function parseRoute(location?: Location): AppRoute {
  const loc = location || (typeof window !== 'undefined' ? window.location : undefined);
  if (!loc) {
    return { view: 'workspace', rawPath: '#/' };
  }

  const hash = loc.hash.replace(/^#\/?/, '');
  const searchParams = new URLSearchParams(loc.search);

  // Default route
  let view: AppView = 'workspace';
  let chapterId: string | undefined = searchParams.get('chapter') || undefined;
  let lessonId: string | undefined = searchParams.get('lesson') || undefined;
  let itemId: string | undefined = searchParams.get('item') || undefined;
  let sectionId: string | undefined = searchParams.get('section') || undefined;

  const segments = hash.split('/').filter(Boolean);

  if (segments.length > 0) {
    const first = segments[0].toLowerCase();
    if (first === 'lesson') {
      view = 'lesson';
      if (segments[1]) lessonId = decodeURIComponent(segments[1]);
      if (segments[2] === 'item' && segments[3]) {
        itemId = decodeURIComponent(segments[3]);
      }
    } else if (first === 'chapter' || first === 'practice') {
      view = first === 'chapter' ? 'workspace' : 'practice';
      if (segments[1]) chapterId = decodeURIComponent(segments[1]);
      if (segments[2] === 'item' && segments[3]) {
        itemId = decodeURIComponent(segments[3]);
      }
    } else if (first === 'offline') {
      view = 'offline';
    } else if (first === 'settings') {
      view = 'settings';
    }
  }

  return {
    view,
    chapterId,
    lessonId,
    itemId,
    sectionId,
    rawPath: loc.hash || '#/'
  };
}

/**
 * Formats an AppRoute into a standard hash URL path.
 */
export function buildRouteUrl(route: Partial<AppRoute>): string {
  const view = route.view || 'workspace';

  if (view === 'lesson' && route.lessonId) {
    let path = `#/lesson/${encodeURIComponent(route.lessonId)}`;
    if (route.itemId) {
      path += `/item/${encodeURIComponent(route.itemId)}`;
    }
    return path;
  }

  if ((view === 'workspace' || view === 'practice') && route.chapterId) {
    const prefix = view === 'practice' ? 'practice' : 'chapter';
    let path = `#/${prefix}/${encodeURIComponent(route.chapterId)}`;
    if (route.itemId) {
      path += `/item/${encodeURIComponent(route.itemId)}`;
    }
    return path;
  }

  if (view === 'offline') return '#/offline';
  if (view === 'settings') return '#/settings';

  return '#/';
}

/**
 * Programmatically navigates to a new route and updates the browser history.
 */
export function navigateTo(route: Partial<AppRoute>, replace: boolean = false): void {
  if (typeof window === 'undefined') return;

  const url = buildRouteUrl(route);
  if (replace) {
    window.history.replaceState(null, '', url);
  } else {
    window.history.pushState(null, '', url);
  }

  // Trigger hashchange event so listeners react
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/**
 * React hook that subscribes to URL route changes.
 */
export function useAppRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute());

  useEffect(() => {
    const handleRouteChange = () => {
      setRoute(parseRoute());
    };

    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);

    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  return route;
}
