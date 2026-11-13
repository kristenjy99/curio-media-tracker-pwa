import { cn } from '../../lib/utils.js';

/** Nhóm nút chọn một trong vài giá trị (radiogroup). */
export function Segmented({ value, onChange, options, label, size = 'md', className }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1', className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-lg font-medium transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              active ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
            )}
          >
            {option.label}
            {option.count !== undefined && <span className="ml-1.5 text-xs text-ink-muted">{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
