import { forwardRef } from 'react';
import { cn } from '../../lib/utils.js';

export const fieldClass =
  'w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-muted/70 focus:border-moss focus:outline-none focus:ring-2 focus:ring-sage/50 disabled:opacity-60 aria-[invalid=true]:border-danger';

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(fieldClass, 'h-10', className)} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldClass, 'min-h-24 py-2 leading-relaxed', className)} {...props} />;
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(fieldClass, 'h-10 cursor-pointer pr-8', className)} {...props}>
      {children}
    </select>
  );
});
