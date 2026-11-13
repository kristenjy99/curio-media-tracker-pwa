import * as RadixTabs from '@radix-ui/react-tabs';
import { cn } from '../../lib/utils.js';

/** Thanh tab gạch chân; nội dung từng tab dùng Tabs.Content của Radix. */
export function Tabs({ value, onValueChange, tabs, label, children, className }) {
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <RadixTabs.List aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((tab) => (
          <RadixTabs.Trigger
            key={tab.value}
            value={tab.value}
            className={cn(
              '-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink',
              'data-[state=active]:border-moss data-[state=active]:text-ink',
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.badge !== undefined && <span className="rounded-full bg-surface-2 px-1.5 text-xs tabular-nums text-ink-muted">{tab.badge}</span>}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {children}
    </RadixTabs.Root>
  );
}

export const TabPanel = ({ className, ...props }) => <RadixTabs.Content className={cn('pt-6 focus-visible:outline-none', className)} {...props} />;
