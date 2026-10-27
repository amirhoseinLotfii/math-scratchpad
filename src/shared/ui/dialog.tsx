import * as Primitive from '@radix-ui/react-dialog';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '../lib/utils';
export const Dialog = Primitive.Root;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export const DialogClose = Primitive.Close;
export const DialogContent = forwardRef<ElementRef<typeof Primitive.Content>, ComponentPropsWithoutRef<typeof Primitive.Content>>(({ children, className, ...props }, ref) => (
 <Primitive.Portal><Primitive.Overlay className="modal-overlay" /><Primitive.Content aria-modal="true" ref={ref} className={cn('modal-content', className)} {...props}>{children}</Primitive.Content></Primitive.Portal>
));
DialogContent.displayName = 'DialogContent';
