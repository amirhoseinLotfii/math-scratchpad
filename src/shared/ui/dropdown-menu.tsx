import * as Primitive from '@radix-ui/react-dropdown-menu';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '../lib/utils';
export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuContent = forwardRef<ElementRef<typeof Primitive.Content>, ComponentPropsWithoutRef<typeof Primitive.Content>>(({ className, ...props }, ref) => (
 <Primitive.Portal><Primitive.Content ref={ref} sideOffset={8} align="end" className={cn('dropdown-content', className)} {...props} /></Primitive.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';
export const DropdownMenuItem = forwardRef<ElementRef<typeof Primitive.Item>, ComponentPropsWithoutRef<typeof Primitive.Item>>(({ className, ...props }, ref) => (
 <Primitive.Item ref={ref} className={cn('dropdown-item', className)} {...props} />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';
export const DropdownMenuLabel = forwardRef<ElementRef<typeof Primitive.Label>, ComponentPropsWithoutRef<typeof Primitive.Label>>(({ className, ...props }, ref) => (
 <Primitive.Label ref={ref} className={cn('dropdown-label', className)} {...props} />
));
DropdownMenuLabel.displayName = 'DropdownMenuLabel';
