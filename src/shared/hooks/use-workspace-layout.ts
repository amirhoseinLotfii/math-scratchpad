import { useSyncExternalStore } from 'react';
import type { WorkspaceLayout } from '../../features/workspace/model/workspace-layout';
import { BREAKPOINT_MEDIA } from '../lib/breakpoints';
const queries = [BREAKPOINT_MEDIA.workspace, BREAKPOINT_MEDIA.wide];
function snapshot(): WorkspaceLayout {
 if (typeof window.matchMedia !== 'function') return 'phone';
 return window.matchMedia(queries[1]).matches ? 'desktop' : window.matchMedia(queries[0]).matches ? 'laptop' : 'phone';
}
function subscribe(change: () => void) {
 if (typeof window.matchMedia !== 'function') return () => {};
 const lists = queries.map(query => window.matchMedia(query));
 lists.forEach(list => list.addEventListener?.('change', change));
 return () => lists.forEach(list => list.removeEventListener?.('change', change));
}
export function useWorkspaceLayout() { return useSyncExternalStore(subscribe, snapshot, () => 'phone' as const); }
