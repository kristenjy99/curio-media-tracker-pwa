import { ChevronDown } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '../../lib/utils.js';

/** Lọc gợi ý theo chữ đang gõ (không phân biệt hoa thường, bỏ dấu), bỏ các giá trị đã chọn. */
export function filterSuggestions(suggestions, query, exclude = []) {
  const fold = (text) => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const taken = new Set(exclude.map(fold));
  const needle = fold(query.trim());
  const seen = new Set();
  return suggestions.filter((value) => {
    const key = fold(value);
    if (seen.has(key) || taken.has(key)) return false;
    seen.add(key);
    return !needle || key.includes(needle);
  });
}

/** Danh sách thả xuống dưới ô nhập; điều khiển bằng chuột hoặc phím mũi tên/Enter/Esc ở ô nhập cha. */
export function SuggestList({ id, options, active, onPick, empty }) {
  const listRef = useRef(null);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  return (
    <ul
      ref={listRef}
      id={id}
      role="listbox"
      className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-xl"
    >
      {options.length === 0 ? (
        <li className="px-2 py-1.5 text-sm text-ink-muted">{empty}</li>
      ) : (
        options.map((option, index) => (
          <li
            key={option}
            role="option"
            aria-selected={index === active}
            data-active={index === active}
            // mousedown để chọn trước khi ô nhập mất focus.
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(option);
            }}
            className={cn('cursor-pointer truncate rounded-md px-2 py-1.5 text-sm', index === active ? 'bg-surface-2 text-ink' : 'text-ink hover:bg-surface-2')}
          >
            {option}
          </li>
        ))
      )}
    </ul>
  );
}

/** Xử lý phím chung cho ô có danh sách thả xuống. Trả true nếu phím đã được dùng. */
export function handleListKeys(event, { open, setOpen, options, active, setActive, onPick }) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (!open) setOpen(true);
    else setActive(Math.min(options.length - 1, active + 1));
    return true;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    setActive(Math.max(-1, active - 1));
    return true;
  }
  if (event.key === 'Escape' && open) {
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    return true;
  }
  if (event.key === 'Enter' && open && active >= 0 && options[active] !== undefined) {
    event.preventDefault();
    onPick(options[active]);
    return true;
  }
  return false;
}

export function ToggleButton({ open, onToggle, label }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      onMouseDown={(event) => {
        event.preventDefault();
        onToggle();
      }}
      className="rounded p-1 text-ink-muted hover:bg-surface-2 hover:text-ink"
    >
      <ChevronDown size={15} className={cn('transition-transform', open && 'rotate-180')} />
    </button>
  );
}
