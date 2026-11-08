import * as Primitive from '@radix-ui/react-dropdown-menu';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '../lib/utils';
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
 <Primitive.Portal><Primitive.SubContent ref={ref} sideOffset={4} className={cn('dropdown-content', 'dropdown-sub-content', className)} {...props} /></Primitive.Portal>
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
