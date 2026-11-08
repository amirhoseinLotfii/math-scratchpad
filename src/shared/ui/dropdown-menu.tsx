import * as Primitive from '@radix-ui/react-dropdown-menu';
import { forwardRef, useId, useState, useSyncExternalStore, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
// A horizontal Radix submenu cannot fit beside a full-width trigger on a narrow phone.
// Use inline disclosure groups on narrow viewports and side flyouts on wider ones.
const narrowMenuQuery = '(max-width: 599px)';
const subscribeToNarrowMenu = (notify: () => void) => {
 if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
 const media = window.matchMedia(narrowMenuQuery);
 media.addEventListener('change', notify);
 return () => media.removeEventListener('change', notify);
};
const getNarrowMenu = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(narrowMenuQuery).matches;
const getServerNarrowMenu = () => false;
export const DropdownMenu = Primitive.Root;
export const DropdownMenuSub = Primitive.Sub;
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuContent = forwardRef<ElementRef<typeof Primitive.Content>, ComponentPropsWithoutRef<typeof Primitive.Content>>(({ className, ...props }, ref) => (
 <Primitive.Portal><Primitive.Content ref={ref} sideOffset={8} align="end" className={cn('dropdown-content', className)} {...props} /></Primitive.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';
export const DropdownMenuSubTrigger = forwardRef<ElementRef<typeof Primitive.SubTrigger>, ComponentPropsWithoutRef<typeof Primitive.SubTrigger>>(({ className, ...props }, ref) => (
 <Primitive.SubTrigger ref={ref} className={cn('dropdown-item', 'dropdown-sub-trigger', className)} {...props} />
));
DropdownMenuSubTrigger.displayName = 'DropdownMenuSubTrigger';
export const DropdownMenuSubContent = forwardRef<ElementRef<typeof Primitive.SubContent>, ComponentPropsWithoutRef<typeof Primitive.SubContent>>(({ className, ...props }, ref) => (
 <Primitive.Portal><Primitive.SubContent ref={ref} sideOffset={-4} collisionPadding={8} className={cn('dropdown-content', 'dropdown-sub-content', className)} {...props} /></Primitive.Portal>
));
DropdownMenuSubContent.displayName = 'DropdownMenuSubContent';
export const DropdownMenuItem = forwardRef<ElementRef<typeof Primitive.Item>, ComponentPropsWithoutRef<typeof Primitive.Item>>(({ className, ...props }, ref) => (
 <Primitive.Item ref={ref} className={cn('dropdown-item', className)} {...props} />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';
export const DropdownMenuLabel = forwardRef<ElementRef<typeof Primitive.Label>, ComponentPropsWithoutRef<typeof Primitive.Label>>(({ className, ...props }, ref) => (
 <Primitive.Label ref={ref} className={cn('dropdown-label', className)} {...props} />
));
DropdownMenuLabel.displayName = 'DropdownMenuLabel';

/**
 * Keeps submenu actions in the existing menu's scroll region on narrow phones.
 * Radix SubContent is always a horizontal flyout, so its position cannot be
 * switched to 'bottom' via props. Wider layouts retain the original submenu.
 */
export function ResponsiveDropdownMenuSub({ label, children }: { label: string; children: ReactNode }) {
 const narrow = useSyncExternalStore(subscribeToNarrowMenu, getNarrowMenu, getServerNarrowMenu);
 const [expanded, setExpanded] = useState(false);
 const contentId = useId();
 if (!narrow) {
  return <Primitive.Sub>
   <DropdownMenuSubTrigger>{label}<ChevronRight aria-hidden="true" /></DropdownMenuSubTrigger>
   <DropdownMenuSubContent aria-label={`${label} actions`}>{children}</DropdownMenuSubContent>
  </Primitive.Sub>;
 }
 return <>
  <DropdownMenuItem className="menu-disclosure" aria-expanded={expanded} aria-controls={expanded ? contentId : undefined}
   onPointerEnter={event => { if (event.pointerType === 'mouse') setExpanded(true); }}
   onSelect={event => { event.preventDefault(); setExpanded(value => !value); }}>
   <span>{label}</span><ChevronDown className={expanded ? 'menu-chevron menu-chevron-open' : 'menu-chevron'} aria-hidden="true" />
  </DropdownMenuItem>
  {expanded && <div id={contentId} role="group" aria-label={`${label} actions`} className="menu-inline-subcontent">{children}</div>}
 </>;
}
