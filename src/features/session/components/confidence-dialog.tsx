import { useEffect, useId, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../../shared/ui/dialog';
import { Button } from '../../../shared/ui/button';
import { confidenceSchema } from '../schemas/session-schema';
type Value = z.infer<typeof confidenceSchema>;
export function ConfidenceDialog({ open, initial, onCancel, onConfirm, invoker }: {
 open: boolean; initial?: Value['confidence']; onCancel: () => void; onConfirm: (value: Value['confidence']) => void; invoker: HTMLElement | null;
}) {
 const id = useId(), restoreFocus = useRef(true);
 const { register, reset, handleSubmit, formState: { errors } } = useForm<Value>({ resolver: zodResolver(confidenceSchema), defaultValues: { confidence: initial ?? 'high' }, reValidateMode: 'onChange' });
 useEffect(() => { if (open) { restoreFocus.current = true; reset({ confidence: initial ?? 'high' }); } }, [open, initial, reset]);
 return <Dialog open={open} onOpenChange={value => { if (!value) onCancel(); }}>
  <DialogContent onCloseAutoFocus={event => { event.preventDefault(); if (restoreFocus.current) invoker?.focus({ preventScroll: true }); }}>
   <DialogTitle>Answer confidence</DialogTitle>
   <DialogDescription>Choose how confident you are in this answer before continuing.</DialogDescription>
   <form onSubmit={handleSubmit(value => (restoreFocus.current = false, onConfirm(value.confidence)))} noValidate>
    <fieldset role="radiogroup" aria-labelledby={`${id}-label`} aria-invalid={!!errors.confidence} aria-describedby={errors.confidence ? `${id}-error` : undefined}>
     <legend id={`${id}-label`}>Confidence level <span>(Required)</span></legend>
     <div className="confidence-options">{(['low','medium','high'] as const).map(value => <label key={value}>
      <input type="radio" value={value} {...register('confidence')} aria-invalid={!!errors.confidence} />
      {({ low: 'Low', medium: 'Medium', high: 'High' })[value]}
     </label>)}</div>
     {errors.confidence && <p id={`${id}-error`} role="alert">{errors.confidence.message}</p>}
    </fieldset>
    <div className="dialog-actions"><Button onClick={onCancel}>Cancel</Button><Button variant="default" type="submit">Continue</Button></div>
   </form>
  </DialogContent>
 </Dialog>;
}
