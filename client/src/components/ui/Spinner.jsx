import { LoaderCircle } from 'lucide-react';
import { cn } from '../../lib/utils.js';

export const Spinner = ({ className, size = 18 }) => <LoaderCircle size={size} className={cn('animate-spin motion-reduce:animate-none', className)} aria-hidden />;
