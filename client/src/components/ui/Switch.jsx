import * as RadixSwitch from '@radix-ui/react-switch';
import { cn } from '../../lib/utils.js';

export function Switch({ className, ...props }) {
  return (
    <RadixSwitch.Root
      className={cn(
        'relative h-6 w-11 shrink-0 cursor-pointer rounded-full border border-line bg-surface-2 transition-colors data-[state=checked]:border-moss data-[state=checked]:bg-moss',
        className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-[1.3rem]" />
    </RadixSwitch.Root>
  );
}
