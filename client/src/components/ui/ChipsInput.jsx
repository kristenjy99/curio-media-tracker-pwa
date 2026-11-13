import { X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { cn } from '../../lib/utils.js';
import { filterSuggestions, handleListKeys, SuggestList, ToggleButton } from './SuggestList.jsx';

/**
 * Ô nhập danh sách: gõ rồi Enter hoặc dấu phẩy để thêm; Backspace khi ô trống để xoá phần tử cuối.
 * Có `suggestions` thì hiện danh sách thả xuống các giá trị đã nhập trước đó, vẫn gõ được giá trị mới.
 */
export function ChipsInput({ value = [], onChange, placeholder, suggestions = [], id, ...aria }) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const inputRef = useRef(null);
  const options = open ? filterSuggestions(suggestions, draft, value).slice(0, 200) : [];

  const add = (raw) => {
    const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return;
    const lower = new Set(value.map((entry) => entry.toLowerCase()));
    // Gõ trùng tên đã có (khác hoa thường) thì dùng đúng cách viết đã có để không tạo hai giá trị.
    const canonical = (part) => suggestions.find((entry) => entry.toLowerCase() === part.toLowerCase()) ?? part;
    onChange([...value, ...parts.map(canonical).filter((part) => !lower.has(part.toLowerCase()))]);
    setDraft('');
    setActive(-1);
  };

  const hasList = suggestions.length > 0;
  return (
    <div className="relative">
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 focus-within:border-moss focus-within:ring-2 focus-within:ring-sage/50"
      >
        {value.map((chip) => (
          <span key={chip} className="inline-flex items-center gap-1 rounded-md bg-surface-2 py-0.5 pl-2 pr-1 text-sm text-ink">
            {chip}
            <button
              type="button"
              className="rounded p-0.5 text-ink-muted hover:bg-line hover:text-ink"
              onClick={() => onChange(value.filter((entry) => entry !== chip))}
              aria-label={`Xoá ${chip}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          {...aria}
          role={hasList ? 'combobox' : undefined}
          aria-expanded={hasList ? open : undefined}
          aria-controls={hasList && open ? listId : undefined}
          aria-autocomplete={hasList ? 'list' : undefined}
          value={draft}
          placeholder={value.length ? '' : placeholder}
          onFocus={() => hasList && setOpen(true)}
          onChange={(event) => {
            const next = event.target.value;
            setOpen(hasList);
            setActive(-1);
            if (next.endsWith(',')) add(next);
            else setDraft(next);
          }}
          onKeyDown={(event) => {
            if (hasList && handleListKeys(event, { open, setOpen, options, active, setActive, onPick: add })) return;
            if (event.key === 'Enter') {
              event.preventDefault();
              add(draft);
            } else if (event.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => {
            add(draft);
            setOpen(false);
          }}
          className="min-w-24 flex-1 bg-transparent px-1 text-sm text-ink placeholder:text-ink-muted/70 focus:outline-none"
        />
        {hasList && <ToggleButton open={open} label="Hiện danh sách đã nhập" onToggle={() => { inputRef.current?.focus(); setOpen(!open); }} />}
      </div>
      {open && <SuggestList id={listId} options={options} active={active} onPick={add} empty={draft.trim() ? `Nhấn Enter để thêm "${draft.trim()}"` : 'Đã chọn hết các giá trị có sẵn'} />}
    </div>
  );
}
