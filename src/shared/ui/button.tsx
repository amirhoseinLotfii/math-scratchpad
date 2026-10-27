import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';
const variants = cva('ui-button', { variants: { variant: { default: 'button-primary', outline: 'button-outline', ghost: 'button-ghost' }, size: { default: '', icon: 'button-icon', sm: 'button-small' } }, defaultVariants: { variant: 'outline', size: 'default' } });
type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants> & { asChild?: boolean };
export const Button = forwardRef<HTMLButtonElement, Props>(({ className, variant, size, asChild, type = 'button', ...props }, ref) => {
 const Component = asChild ? Slot : 'button';
 return <Component ref={ref} type={type} className={cn(variants({ variant, size }), className)} {...props} />;
});
Button.displayName = 'Button';
