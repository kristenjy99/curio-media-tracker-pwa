import { forwardRef } from 'react';
import { cn } from '../../lib/utils.js';

const VARIANTS = {
  primary: 'bg-moss text-on-moss hover:brightness-110 disabled:opacity-50',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2 disabled:opacity-50',
  ghost: 'text-ink hover:bg-surface-2 disabled:opacity-40',
  danger: 'bg-danger text-white hover:brightness-110 disabled:opacity-50',
  link: 'text-moss underline-offset-4 hover:underline px-0',
};

const SIZES = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  icon: 'h-10 w-10 justify-center',
  'icon-sm': 'h-8 w-8 justify-center',
};

export const Button = forwardRef(function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});
